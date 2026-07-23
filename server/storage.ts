import { deals, users, magicTokens, sessions, dealSnapshots } from '@shared/schema';
import type { Deal, InsertDeal, User, MagicToken, Session, DealSnapshot } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, eq, desc, gt, lt, isNull, or, asc } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

// DATA_DIR points at a persistent disk in production (e.g. /var/data on Render).
// Falls back to the working directory for local dev so `npm run dev` still writes ./data.db.
const DATA_DIR = process.env.DATA_DIR || ".";
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "data.db");

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Bootstrap schema on startup (no migrations setup)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER,
    welcome_email_sent_at INTEGER,
    drip_day2_sent_at INTEGER,
    drip_day5_sent_at INTEGER,
    unsubscribed_at INTEGER,
    unsubscribe_token TEXT
  );

  CREATE TABLE IF NOT EXISTS magic_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_magic_tokens_email ON magic_tokens(email);

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS rentcast_cache (
    cache_key TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rentcast_cache_expires_at ON rentcast_cache(expires_at);

  CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    address TEXT NOT NULL,
    city TEXT,
    state TEXT,
    zip TEXT,
    lat REAL,
    lon REAL,
    beds REAL,
    baths REAL,
    sqft INTEGER,
    year_built INTEGER,
    inputs TEXT NOT NULL,
    notes TEXT,
    name TEXT,
    budget TEXT,
    pinned INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    last_opened_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deal_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL,
    is_original INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    change_summary TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_deal_snapshots_deal_id ON deal_snapshots(deal_id);
`);

// Migration: add user_id column to deals if missing (for upgrades from pre-auth db)
try {
  const cols = sqlite.prepare("PRAGMA table_info(deals)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "user_id")) {
    sqlite.exec("ALTER TABLE deals ADD COLUMN user_id INTEGER;");
  }
} catch (e) {
  console.warn("deals.user_id migration skipped:", e);
}

// v1.2.0 migration: add nickname / pinned / archived / last_opened_at columns.
// Each ALTER is wrapped in its own try/catch so a partial upgrade still
// completes the remaining columns on next boot.
for (const [col, ddl] of [
  ["name", "ALTER TABLE deals ADD COLUMN name TEXT;"],
  ["pinned", "ALTER TABLE deals ADD COLUMN pinned INTEGER DEFAULT 0;"],
  ["archived", "ALTER TABLE deals ADD COLUMN archived INTEGER DEFAULT 0;"],
  ["last_opened_at", "ALTER TABLE deals ADD COLUMN last_opened_at INTEGER;"],
  // v1.6.1: Walkthrough Budget line items (JSON).
  ["budget", "ALTER TABLE deals ADD COLUMN budget TEXT;"],
] as const) {
  try {
    const cols = sqlite.prepare("PRAGMA table_info(deals)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      sqlite.exec(ddl);
      console.log(`[storage] migration: added deals.${col}`);
    }
  } catch (e) {
    console.warn(`deals.${col} migration skipped:`, e);
  }
}

// v1.5.2 migration: welcome-drip campaign columns on users. Same per-column
// guarded-ALTER pattern as the deals migrations above so a partial upgrade
// finishes on the next boot.
for (const [col, ddl] of [
  ["welcome_email_sent_at", "ALTER TABLE users ADD COLUMN welcome_email_sent_at INTEGER;"],
  ["drip_day2_sent_at", "ALTER TABLE users ADD COLUMN drip_day2_sent_at INTEGER;"],
  ["drip_day5_sent_at", "ALTER TABLE users ADD COLUMN drip_day5_sent_at INTEGER;"],
  ["unsubscribed_at", "ALTER TABLE users ADD COLUMN unsubscribed_at INTEGER;"],
  ["unsubscribe_token", "ALTER TABLE users ADD COLUMN unsubscribe_token TEXT;"],
] as const) {
  try {
    const cols = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      sqlite.exec(ddl);
      console.log(`[storage] migration: added users.${col}`);
    }
  } catch (e) {
    console.warn(`users.${col} migration skipped:`, e);
  }
}

// One-time deal wipe — set WIPE_DEALS_ON_BOOT=1 in env. Idempotent guard:
// after wiping, writes a marker row so subsequent restarts don't wipe again,
// even if the env var is left set by mistake. To wipe again later, set the
// env var AND delete the data.db file (or update the marker version).
try {
  if (process.env.WIPE_DEALS_ON_BOOT === "1") {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY, ran_at INTEGER NOT NULL);`);
    const marker = sqlite
      .prepare("SELECT key FROM _migrations WHERE key = ?")
      .get("wipe-deals-2026-04-27") as { key: string } | undefined;
    if (!marker) {
      const before = (sqlite.prepare("SELECT COUNT(*) as c FROM deals").get() as { c: number }).c;
      sqlite.exec("DELETE FROM deals;");
      sqlite
        .prepare("INSERT INTO _migrations (key, ran_at) VALUES (?, ?)")
        .run("wipe-deals-2026-04-27", Date.now());
      console.log(`[storage] WIPE_DEALS_ON_BOOT: deleted ${before} deal(s); marker recorded.`);
    } else {
      console.log("[storage] WIPE_DEALS_ON_BOOT set but already ran (marker present); skipping.");
    }
  }
} catch (e) {
  console.warn("deals wipe skipped:", e);
}

// Bootstrap guest user (id=1) for use when auth is disabled. Idempotent.
try {
  const now = Date.now();
  sqlite
    .prepare(
      "INSERT OR IGNORE INTO users (id, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(1, "guest@propboxiq.local", "Guest", now, now);
} catch (e) {
  console.warn("guest user bootstrap skipped:", e);
}

export interface IStorage {
  // Deals (scoped to user)
  listDeals(userId: number): Promise<Deal[]>;
  getDeal(id: number, userId: number): Promise<Deal | undefined>;
  touchDeal(id: number, userId: number): Promise<void>;
  createDeal(userId: number, deal: InsertDeal): Promise<Deal>;
  updateDeal(id: number, userId: number, deal: Partial<InsertDeal>): Promise<Deal | undefined>;
  deleteDeal(id: number, userId: number): Promise<boolean>;

  // Deal snapshots (v1.7.0). Callers must verify deal ownership first.
  listSnapshots(dealId: number): Promise<DealSnapshot[]>;
  getSnapshot(dealId: number, snapshotId: number): Promise<DealSnapshot | undefined>;
  countSnapshots(dealId: number): Promise<number>;
  createSnapshot(
    dealId: number,
    payload: string,
    changeSummary: string | null,
    isOriginal: boolean,
  ): Promise<DealSnapshot>;
  deleteSnapshot(dealId: number, snapshotId: number): Promise<"deleted" | "not_found" | "is_original">;
  /** Prune oldest non-original snapshots until at most `max` remain. */
  pruneSnapshots(dealId: number, max: number): Promise<number>;

  // Users
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUnsubscribeToken(token: string): Promise<User | undefined>;
  // Returns `isNew: true` only the first time a given email is seen — that's
  // the signal the welcome-drip campaign hooks into on first OAuth login.
  upsertUser(email: string, name?: string | null): Promise<{ user: User; isNew: boolean }>;
  touchLogin(userId: number): Promise<void>;

  // Welcome-drip campaign markers (idempotency + opt-out)
  markWelcomeSent(userId: number): Promise<void>;
  markDrip2Sent(userId: number): Promise<void>;
  markDrip5Sent(userId: number): Promise<void>;
  markUnsubscribed(token: string): Promise<User | undefined>;
  resubscribe(token: string): Promise<User | undefined>;
  // Drip-batch queries (Option-A cron fallback). Each returns users due for
  // the given email that haven't received it and haven't unsubscribed.
  usersDueForDrip2(now: number): Promise<User[]>;
  usersDueForDrip5(now: number): Promise<User[]>;

  // Magic tokens
  createMagicToken(token: string, email: string, ttlMs: number): Promise<void>;
  consumeMagicToken(token: string): Promise<{ email: string } | null>;

  // Sessions
  createSession(sessionId: string, userId: number, ttlMs: number): Promise<void>;
  getSession(sessionId: string): Promise<{ userId: number } | null>;
  deleteSession(sessionId: string): Promise<void>;
}

/**
 * The guest user (id=1) is used when auth is disabled. To stay backward-compatible
 * with deals saved before auth existed (user_id IS NULL), the guest's deal queries
 * also match NULL user_id rows. Real authenticated users (id >= 2) only see their own.
 */
const GUEST_ID = 1;
function dealOwnership(userId: number) {
  return userId === GUEST_ID
    ? or(eq(deals.userId, userId), isNull(deals.userId))
    : eq(deals.userId, userId);
}

export class DatabaseStorage implements IStorage {
  // ---------- Deals ----------
  async listDeals(userId: number): Promise<Deal[]> {
    return db
      .select()
      .from(deals)
      .where(dealOwnership(userId))
      .orderBy(desc(deals.updatedAt))
      .all();
  }

  async getDeal(id: number, userId: number): Promise<Deal | undefined> {
    return db
      .select()
      .from(deals)
      .where(and(eq(deals.id, id), dealOwnership(userId)))
      .get();
  }

  async createDeal(userId: number, insert: InsertDeal): Promise<Deal> {
    const now = Date.now();
    return db
      .insert(deals)
      .values({ ...insert, userId, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }

  async updateDeal(id: number, userId: number, patch: Partial<InsertDeal>): Promise<Deal | undefined> {
    const now = Date.now();
    return db
      .update(deals)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(deals.id, id), dealOwnership(userId)))
      .returning()
      .get();
  }

  /** Bumps last_opened_at without changing updated_at. Used on GET /api/deals/:id. */
  async touchDeal(id: number, userId: number): Promise<void> {
    db
      .update(deals)
      .set({ lastOpenedAt: Date.now() })
      .where(and(eq(deals.id, id), dealOwnership(userId)))
      .run();
  }

  async deleteDeal(id: number, userId: number): Promise<boolean> {
    const res = db
      .delete(deals)
      .where(and(eq(deals.id, id), dealOwnership(userId)))
      .run();
    return (res.changes ?? 0) > 0;
  }

  // ---------- Deal snapshots ----------
  async listSnapshots(dealId: number): Promise<DealSnapshot[]> {
    return db
      .select()
      .from(dealSnapshots)
      .where(eq(dealSnapshots.dealId, dealId))
      .orderBy(desc(dealSnapshots.createdAt), desc(dealSnapshots.id))
      .all();
  }

  async getSnapshot(dealId: number, snapshotId: number): Promise<DealSnapshot | undefined> {
    return db
      .select()
      .from(dealSnapshots)
      .where(and(eq(dealSnapshots.id, snapshotId), eq(dealSnapshots.dealId, dealId)))
      .get();
  }

  async countSnapshots(dealId: number): Promise<number> {
    const rows = db
      .select({ id: dealSnapshots.id })
      .from(dealSnapshots)
      .where(eq(dealSnapshots.dealId, dealId))
      .all();
    return rows.length;
  }

  async createSnapshot(
    dealId: number,
    payload: string,
    changeSummary: string | null,
    isOriginal: boolean,
  ): Promise<DealSnapshot> {
    return db
      .insert(dealSnapshots)
      .values({
        dealId,
        payload,
        changeSummary,
        isOriginal,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async deleteSnapshot(
    dealId: number,
    snapshotId: number,
  ): Promise<"deleted" | "not_found" | "is_original"> {
    const row = await this.getSnapshot(dealId, snapshotId);
    if (!row) return "not_found";
    if (row.isOriginal) return "is_original";
    db.delete(dealSnapshots).where(eq(dealSnapshots.id, snapshotId)).run();
    return "deleted";
  }

  async pruneSnapshots(dealId: number, max: number): Promise<number> {
    // Enforce a hard cap of `max` TOTAL snapshots per deal. When over the cap,
    // delete the oldest NON-original snapshots first; the original is never
    // pruned even if that means staying above the cap.
    const rows = db
      .select({ id: dealSnapshots.id, isOriginal: dealSnapshots.isOriginal })
      .from(dealSnapshots)
      .where(eq(dealSnapshots.dealId, dealId))
      .orderBy(asc(dealSnapshots.createdAt), asc(dealSnapshots.id))
      .all();
    let excess = rows.length - max;
    if (excess <= 0) return 0;
    let removed = 0;
    for (const r of rows) {
      if (excess <= 0) break;
      if (r.isOriginal) continue;
      db.delete(dealSnapshots).where(eq(dealSnapshots.id, r.id)).run();
      removed++;
      excess--;
    }
    return removed;
  }

  // ---------- Users ----------
  async getUserById(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  async getUserByUnsubscribeToken(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    return db.select().from(users).where(eq(users.unsubscribeToken, token)).get();
  }

  async upsertUser(email: string, name?: string | null): Promise<{ user: User; isNew: boolean }> {
    const lower = email.toLowerCase().trim();
    const existing = await this.getUserByEmail(lower);
    if (existing) {
      // Backfill an unsubscribe token for users created before this column existed.
      if (!existing.unsubscribeToken) {
        const token = randomBytes(32).toString("base64url");
        const updated = db
          .update(users)
          .set({ unsubscribeToken: token })
          .where(eq(users.id, existing.id))
          .returning()
          .get();
        return { user: updated, isNew: false };
      }
      return { user: existing, isNew: false };
    }
    const now = Date.now();
    const user = db
      .insert(users)
      .values({
        email: lower,
        name: name ?? null,
        createdAt: now,
        lastLoginAt: null,
        unsubscribeToken: randomBytes(32).toString("base64url"),
      })
      .returning()
      .get();
    return { user, isNew: true };
  }

  async touchLogin(userId: number): Promise<void> {
    db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, userId)).run();
  }

  // ---------- Welcome-drip campaign ----------
  async markWelcomeSent(userId: number): Promise<void> {
    db.update(users).set({ welcomeEmailSentAt: Date.now() }).where(eq(users.id, userId)).run();
  }

  async markDrip2Sent(userId: number): Promise<void> {
    db.update(users).set({ dripDay2SentAt: Date.now() }).where(eq(users.id, userId)).run();
  }

  async markDrip5Sent(userId: number): Promise<void> {
    db.update(users).set({ dripDay5SentAt: Date.now() }).where(eq(users.id, userId)).run();
  }

  async markUnsubscribed(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    return db
      .update(users)
      .set({ unsubscribedAt: Date.now() })
      .where(eq(users.unsubscribeToken, token))
      .returning()
      .get();
  }

  async resubscribe(token: string): Promise<User | undefined> {
    if (!token) return undefined;
    return db
      .update(users)
      .set({ unsubscribedAt: null })
      .where(eq(users.unsubscribeToken, token))
      .returning()
      .get();
  }

  async usersDueForDrip2(now: number): Promise<User[]> {
    const cutoff = now - 2 * 24 * 60 * 60 * 1000;
    return db
      .select()
      .from(users)
      .where(
        and(
          lt(users.welcomeEmailSentAt, cutoff),
          isNull(users.dripDay2SentAt),
          isNull(users.unsubscribedAt),
        ),
      )
      .all();
  }

  async usersDueForDrip5(now: number): Promise<User[]> {
    const cutoff = now - 5 * 24 * 60 * 60 * 1000;
    return db
      .select()
      .from(users)
      .where(
        and(
          lt(users.welcomeEmailSentAt, cutoff),
          isNull(users.dripDay5SentAt),
          isNull(users.unsubscribedAt),
        ),
      )
      .all();
  }

  // ---------- Magic tokens ----------
  async createMagicToken(token: string, email: string, ttlMs: number): Promise<void> {
    const now = Date.now();
    db.insert(magicTokens)
      .values({
        token,
        email: email.toLowerCase().trim(),
        createdAt: now,
        expiresAt: now + ttlMs,
        usedAt: null,
      })
      .run();
  }

  async consumeMagicToken(token: string): Promise<{ email: string } | null> {
    const row = db.select().from(magicTokens).where(eq(magicTokens.token, token)).get();
    if (!row) return null;
    if (row.usedAt) return null;
    if (row.expiresAt < Date.now()) return null;
    db.update(magicTokens).set({ usedAt: Date.now() }).where(eq(magicTokens.token, token)).run();
    return { email: row.email };
  }

  // ---------- Sessions ----------
  async createSession(sessionId: string, userId: number, ttlMs: number): Promise<void> {
    const now = Date.now();
    db.insert(sessions)
      .values({
        id: sessionId,
        userId,
        createdAt: now,
        expiresAt: now + ttlMs,
      })
      .run();
  }

  async getSession(sessionId: string): Promise<{ userId: number } | null> {
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!row) return null;
    if (row.expiresAt < Date.now()) {
      db.delete(sessions).where(eq(sessions.id, sessionId)).run();
      return null;
    }
    return { userId: row.userId };
  }

  async deleteSession(sessionId: string): Promise<void> {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  }
}

export const storage = new DatabaseStorage();
