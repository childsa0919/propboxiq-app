import { deals, users, magicTokens, sessions } from '@shared/schema';
import type { Deal, InsertDeal, User, MagicToken, Session } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, eq, desc, gt, isNull, or } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Bootstrap schema on startup (no migrations setup)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
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
  createDeal(userId: number, deal: InsertDeal): Promise<Deal>;
  updateDeal(id: number, userId: number, deal: Partial<InsertDeal>): Promise<Deal | undefined>;
  deleteDeal(id: number, userId: number): Promise<boolean>;

  // Users
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(email: string, name?: string | null): Promise<User>;
  touchLogin(userId: number): Promise<void>;

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

  async deleteDeal(id: number, userId: number): Promise<boolean> {
    const res = db
      .delete(deals)
      .where(and(eq(deals.id, id), dealOwnership(userId)))
      .run();
    return (res.changes ?? 0) > 0;
  }

  // ---------- Users ----------
  async getUserById(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  async upsertUser(email: string, name?: string | null): Promise<User> {
    const lower = email.toLowerCase().trim();
    const existing = await this.getUserByEmail(lower);
    if (existing) return existing;
    const now = Date.now();
    return db
      .insert(users)
      .values({ email: lower, name: name ?? null, createdAt: now, lastLoginAt: null })
      .returning()
      .get();
  }

  async touchLogin(userId: number): Promise<void> {
    db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, userId)).run();
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
