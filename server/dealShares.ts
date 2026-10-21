// v1.8.0 Deal Sharing — service layer. Routes (dealShareRoutes.ts) are thin
// wrappers over these functions so the script test can exercise the exact
// same logic against a temp SQLite DB.
//
// What gets copied: the recipient's deal is rebuilt from a frozen payload that
// holds every per-deal store the Flip result reads —
//   • deals row: inputs (incl. Sources & Uses overrides in
//     inputs.sourcesUsesOverrides), notes (saved comps envelope used for ARV),
//     property facts, nickname
//   • deals.budget (Walkthrough Budget line items)
//   • comp_hero_state (Comp Hero selections + manual comps)
// Snapshot history is NOT copied: accept creates one original snapshot via the
// existing helpers (buildBackfillPayload + storage.createSnapshot).
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { db, sqliteDb, storage } from "./storage";
import {
  compHeroState,
  dealInputsSchema,
  dealShares,
  deals,
  defaultDealInputs,
  users,
  type CompHeroStateRow,
  type Deal,
  type DealInputs,
  type DealShare,
  type SourcesUsesOverrides,
  type User,
} from "@shared/schema";
import {
  DAY_MS,
  SHARE_DAILY_LIMIT,
  SHARE_ERRORS,
  SHARE_NOTE_MAX,
  buildSmsBody,
  deriveDisplayStatus,
  displayNameOf,
  inviteExpiresInDays,
  isInviteExpired,
  isValidShareEmail,
  maskEmail,
  normalizeShareEmail,
  normalizeUsPhone,
  toE164,
  type CreateShareResponse,
  type InboxShare,
  type SentShare,
  type ShareSummary,
  type ShareTokenResolution,
} from "@shared/dealShares";
import { buildBackfillPayload } from "./snapshots";
import { calculateDeal } from "@/lib/calc";
import { APP_ORIGIN } from "./emails/layout";
import { dealInviteEmail, sendDealInviteEmail, type InviteSender } from "./emails/dealInvite";

export type ShareResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const ok = <T>(value: T): ShareResult<T> => ({ ok: true, value });
const fail = <T = never>(status: number, error: string): ShareResult<T> => ({ ok: false, status, error });

type SharedDealFields = Omit<
  Deal,
  "id" | "userId" | "createdAt" | "updatedAt" | "lastOpenedAt" | "budget" | "pinned" | "archived" | "receivedFromUserId"
>;

export interface SharePayloadV1 {
  payloadVersion: 1;
  deal: SharedDealFields;
  /** Walkthrough Budget (parsed deals.budget), null if never opened. */
  budget: unknown | null;
  /** comp_hero_state columns verbatim, null if the sender never used Comp Hero. */
  compHero: { selectedCompKeys: string; manualComps: string } | null;
  /** Mirror of deal.inputs.sourcesUsesOverrides (stored inside inputs, restored from there). */
  sourcesUses: SourcesUsesOverrides | null;
  /** Mirror of the saved comps envelope in deal.notes (restored from there). */
  comps: unknown | null;
}

export interface CreateShareBody {
  email?: unknown;
  phone?: unknown;
  note?: unknown;
}

// ---------- helpers ----------

export function shareBaseUrl(): string {
  return (process.env.SHARE_BASE_URL || process.env.PUBLIC_ORIGIN || APP_ORIGIN).replace(/\/+$/, "");
}

export function shareUrlFor(token: string): string {
  return `${shareBaseUrl()}/s/${token}`;
}

function parseInputs(deal: Pick<Deal, "inputs">): DealInputs {
  try {
    const parsed = dealInputsSchema.safeParse(JSON.parse(deal.inputs));
    if (parsed.success) return { ...defaultDealInputs, ...parsed.data };
  } catch {
    /* fall through */
  }
  return { ...defaultDealInputs };
}

function parseJson(raw: string | null | undefined): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function compsEnvelopeOf(notes: string | null): any | null {
  const env = parseJson(notes) as any;
  return env && typeof env === "object" && env.kind === "comps" ? env : null;
}

export function buildShareSummary(deal: Deal): ShareSummary {
  const inputs = parseInputs(deal);
  const r = calculateDeal(inputs, { state: deal.state, city: deal.city });
  const style = compsEnvelopeOf(deal.notes)?.compsData?.subject?.style;
  return {
    street: deal.address,
    city: deal.city ?? null,
    state: deal.state ?? null,
    zip: deal.zip ?? null,
    sqft: deal.sqft ?? null,
    style: typeof style === "string" && style.trim() ? style.trim() : null,
    arv: Math.round(inputs.arv),
    profit: Math.round(r.netProfit),
    price: Math.round(inputs.purchasePrice),
  };
}

export function buildSharePayload(deal: Deal, chs: CompHeroStateRow | undefined): SharePayloadV1 {
  const {
    id: _id,
    userId: _userId,
    createdAt: _c,
    updatedAt: _u,
    lastOpenedAt: _l,
    budget,
    pinned: _p,
    archived: _a,
    receivedFromUserId: _r,
    ...rest
  } = deal;
  return {
    payloadVersion: 1,
    deal: rest,
    budget: parseJson(budget),
    compHero: chs ? { selectedCompKeys: chs.selectedCompKeys, manualComps: chs.manualComps } : null,
    sourcesUses: parseInputs(deal).sourcesUsesOverrides ?? null,
    comps: compsEnvelopeOf(deal.notes),
  };
}

function nameOf(user: User | undefined): string {
  return user ? displayNameOf(user.name, user.email) : "a PropBoxIQ user";
}

function isRecipient(share: DealShare, user: User): boolean {
  return share.recipientUserId === user.id || share.recipientEmail === user.email.toLowerCase();
}

function newShareToken(): string {
  for (let i = 0; i < 6; i++) {
    const t = randomBytes(8).toString("base64url").slice(0, 10);
    const clash = db.select({ id: dealShares.id }).from(dealShares).where(eq(dealShares.token, t)).get();
    if (!clash) return t;
  }
  throw new Error("Could not allocate a unique share token");
}

function parseSummary(raw: string): ShareSummary {
  return JSON.parse(raw) as ShareSummary;
}

// ---------- send ----------

export async function createShare(
  senderId: number,
  dealId: number,
  body: CreateShareBody,
  opts: { now?: number; sendInvite?: InviteSender } = {},
): Promise<ShareResult<CreateShareResponse>> {
  const now = opts.now ?? Date.now();
  // Ownership + Flip-only: server-side `deals` rows are Flip deals (Hold deals
  // live in localStorage), so "owned deal row" is the Flip guard.
  const deal = Number.isFinite(dealId) ? await storage.getDeal(dealId, senderId) : undefined;
  if (!deal) return fail(404, SHARE_ERRORS.cantShare);
  const sender = await storage.getUserById(senderId);
  if (!sender) return fail(403, SHARE_ERRORS.cantShare);

  const email = normalizeShareEmail(body.email);
  if (!isValidShareEmail(email)) return fail(400, SHARE_ERRORS.invalidEmail);
  if (email === sender.email.toLowerCase()) return fail(400, SHARE_ERRORS.self);

  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  let phone10: string | null = null;
  if (rawPhone) {
    phone10 = normalizeUsPhone(rawPhone);
    if (!phone10) return fail(400, SHARE_ERRORS.phone);
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > SHARE_NOTE_MAX) return fail(400, SHARE_ERRORS.note);

  const pendingSame = db
    .select()
    .from(dealShares)
    .where(and(eq(dealShares.sourceDealId, dealId), eq(dealShares.recipientEmail, email), eq(dealShares.status, "pending")))
    .all();
  if (pendingSame.some((s) => !isInviteExpired(s, now))) return fail(409, SHARE_ERRORS.duplicate);

  const recent = db
    .select({ id: dealShares.id })
    .from(dealShares)
    .where(and(eq(dealShares.senderUserId, senderId), gt(dealShares.createdAt, now - DAY_MS)))
    .all();
  if (recent.length >= SHARE_DAILY_LIMIT) return fail(429, SHARE_ERRORS.dailyLimit);

  const recipient = await storage.getUserByEmail(email);
  const payload = buildSharePayload(deal, await storage.getCompHeroState(dealId));
  const summary = buildShareSummary(deal);
  const token = newShareToken();

  const row = db
    .insert(dealShares)
    .values({
      token,
      senderUserId: senderId,
      sourceDealId: dealId,
      recipientEmail: email,
      recipientUserId: recipient?.id ?? null,
      invited: !recipient,
      texted: !!phone10,
      note: note || null,
      payload: JSON.stringify(payload),
      summary: JSON.stringify(summary),
      status: "pending",
      createdAt: now,
    })
    .returning()
    .get();

  const shareUrl = shareUrlFor(token);
  let inviteEmailFailed = false;
  if (!recipient) {
    const send = opts.sendInvite ?? sendDealInviteEmail;
    try {
      const mail = dealInviteEmail({ senderName: nameOf(sender), summary, note: note || null, shareUrl });
      const res = await send({ to: email, ...mail });
      inviteEmailFailed = !res.ok;
    } catch (e) {
      console.error("[deal-share] invite send threw", e);
      inviteEmailFailed = true;
    }
  }

  const resp: CreateShareResponse = {
    shareId: row.id,
    token,
    shareUrl,
    displayStatus: recipient ? "PENDING" : "INVITED",
  };
  if (phone10) {
    resp.smsTo = toE164(phone10);
    resp.smsBody = buildSmsBody({ street: summary.street, city: summary.city, arv: summary.arv, profit: summary.profit, shareUrl });
  }
  if (inviteEmailFailed) resp.inviteEmailFailed = true;
  return ok(resp);
}

// ---------- read ----------

export async function listInbox(userId: number, now = Date.now()): Promise<InboxShare[]> {
  const user = await storage.getUserById(userId);
  if (!user) return [];
  const rows = db
    .select()
    .from(dealShares)
    .where(
      and(
        eq(dealShares.status, "pending"),
        or(eq(dealShares.recipientUserId, userId), eq(dealShares.recipientEmail, user.email.toLowerCase())),
      ),
    )
    .orderBy(desc(dealShares.createdAt), desc(dealShares.id))
    .all()
    .filter((s) => !isInviteExpired(s, now));
  const senders = new Map<number, User | undefined>();
  const out: InboxShare[] = [];
  for (const s of rows) {
    if (!senders.has(s.senderUserId)) senders.set(s.senderUserId, await storage.getUserById(s.senderUserId));
    out.push({
      id: s.id,
      token: s.token,
      sender: { name: nameOf(senders.get(s.senderUserId)), avatarUrl: null },
      summary: parseSummary(s.summary),
      note: s.note,
      createdAt: s.createdAt,
    });
  }
  return out;
}

export async function inboxCount(userId: number, now = Date.now()): Promise<number> {
  return (await listInbox(userId, now)).length;
}

export async function listSent(userId: number, now = Date.now()): Promise<SentShare[]> {
  return db
    .select()
    .from(dealShares)
    .where(eq(dealShares.senderUserId, userId))
    .orderBy(desc(dealShares.createdAt), desc(dealShares.id))
    .all()
    .map((s) => {
      const displayStatus = deriveDisplayStatus(s, now);
      const item: SentShare = {
        id: s.id,
        summary: parseSummary(s.summary),
        recipientEmail: s.recipientEmail,
        texted: s.texted,
        invited: s.invited,
        displayStatus,
        createdAt: s.createdAt,
        respondedAt: s.respondedAt ?? null,
      };
      if (displayStatus === "INVITED") item.expiresInDays = inviteExpiresInDays(s.createdAt, now);
      return item;
    });
}

export async function resolveShareToken(userId: number, token: string, now = Date.now()): Promise<ShareTokenResolution> {
  const share = db.select().from(dealShares).where(eq(dealShares.token, String(token ?? ""))).get();
  if (!share || share.status !== "pending" || isInviteExpired(share, now)) {
    return { shareId: share?.id ?? null, state: "unavailable" };
  }
  const user = await storage.getUserById(userId);
  if (user && isRecipient(share, user)) return { shareId: share.id, state: "mine" };
  return { shareId: share.id, state: "other-account", maskedEmail: maskEmail(share.recipientEmail) };
}

// ---------- respond ----------

type Guarded = ShareResult<{ share: DealShare; user: User }>;

async function guardRecipient(userId: number, shareId: number, now: number): Promise<Guarded> {
  const user = await storage.getUserById(userId);
  const share = Number.isFinite(shareId)
    ? db.select().from(dealShares).where(eq(dealShares.id, shareId)).get()
    : undefined;
  if (!share) return fail(404, SHARE_ERRORS.unavailable);
  if (!user || !isRecipient(share, user)) return fail(403, SHARE_ERRORS.forbidden);
  if (share.status !== "pending" || isInviteExpired(share, now)) return fail(409, SHARE_ERRORS.unavailable);
  return ok({ share, user });
}

class ShareConflict extends Error {}

export async function acceptShare(userId: number, shareId: number, now = Date.now()): Promise<ShareResult<{ dealId: number }>> {
  const g = await guardRecipient(userId, shareId, now);
  if (!g.ok) return g;
  const { share } = g.value;
  const payload = parseJson(share.payload) as SharePayloadV1 | null;
  if (!payload || payload.payloadVersion !== 1 || !payload.deal) return fail(409, SHARE_ERRORS.unavailable);
  const label = `Received from ${nameOf(await storage.getUserById(share.senderUserId))}`;

  // One SQLite transaction. better-sqlite3 is synchronous and storage helpers
  // never yield to the event loop (they await already-settled values only),
  // so no other request can interleave between BEGIN and COMMIT.
  sqliteDb.exec("BEGIN IMMEDIATE");
  try {
    const newDeal = db
      .insert(deals)
      .values({
        ...payload.deal,
        budget: payload.budget == null ? null : JSON.stringify(payload.budget),
        userId,
        receivedFromUserId: share.senderUserId,
        pinned: false,
        archived: false,
        lastOpenedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (payload.compHero) {
      db.insert(compHeroState)
        .values({
          dealId: newDeal.id,
          selectedCompKeys: payload.compHero.selectedCompKeys,
          manualComps: payload.compHero.manualComps,
          updatedAt: new Date(now),
        })
        .run();
    }
    // Snapshot v1 via the existing helpers. The label rides along as an extra
    // JSON field on the payload; SnapshotPayload itself is unchanged.
    const snapshot = { ...buildBackfillPayload(newDeal), label };
    await storage.createSnapshot(newDeal.id, JSON.stringify(snapshot), null, true);
    const upd = db
      .update(dealShares)
      .set({ status: "accepted", acceptedDealId: newDeal.id, respondedAt: now, recipientUserId: userId })
      .where(and(eq(dealShares.id, share.id), eq(dealShares.status, "pending")))
      .run();
    if (upd.changes !== 1) throw new ShareConflict();
    sqliteDb.exec("COMMIT");
    return ok({ dealId: newDeal.id });
  } catch (e) {
    sqliteDb.exec("ROLLBACK");
    if (e instanceof ShareConflict) return fail(409, SHARE_ERRORS.unavailable);
    throw e;
  }
}

export async function declineShare(userId: number, shareId: number, now = Date.now()): Promise<ShareResult<{ ok: true }>> {
  const g = await guardRecipient(userId, shareId, now);
  if (!g.ok) return g;
  const upd = db
    .update(dealShares)
    .set({ status: "declined", respondedAt: now, recipientUserId: userId })
    .where(and(eq(dealShares.id, g.value.share.id), eq(dealShares.status, "pending")))
    .run();
  if (upd.changes !== 1) return fail(409, SHARE_ERRORS.unavailable);
  return ok({ ok: true as const });
}

// ---------- deal list helper ----------

/** Adds `receivedFromName` to deals that came from an accepted share. */
export async function withReceivedFromNames<T extends Deal>(rows: T[]): Promise<Array<T & { receivedFromName: string | null }>> {
  const ids = Array.from(new Set(rows.map((d) => d.receivedFromUserId).filter((v): v is number => v != null)));
  const names = new Map<number, string>();
  if (ids.length) {
    for (const u of db.select().from(users).where(inArray(users.id, ids)).all()) {
      names.set(u.id, displayNameOf(u.name, u.email));
    }
  }
  return rows.map((d) => ({
    ...d,
    receivedFromName: d.receivedFromUserId != null ? names.get(d.receivedFromUserId) ?? null : null,
  }));
}
