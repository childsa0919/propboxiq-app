# Deal Sharing (v1.8.0) Implementation Plan

> **For implementers:** Use superpowers-subagent-driven-development (if your platform
> supports agent/task delegation) or superpowers-executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user send a Flip deal by email (optional SMS handoff, optional note) so the recipient can accept their own fully editable, independent copy — with an inbox, a Sent tab, invites for people without an account, and share links.

**Architecture:** One new SQLite table `deal_shares` (runtime `CREATE TABLE IF NOT EXISTS`, same pattern as every other table in `server/storage.ts`) holds a frozen JSON payload of everything the Flip result reads (deals row incl. `inputs.sourcesUsesOverrides` + saved comps envelope in `notes`, `deals.budget`, `comp_hero_state`). A service module `server/dealShares.ts` owns all rules and guards; `server/dealShareRoutes.ts` is a thin HTTP wrapper. Accept inserts a new deal + Comp Hero row + one original snapshot (via the existing `buildBackfillPayload` + `storage.createSnapshot`) inside one SQLite transaction. The client adds a bottom-sheet sender, a `/shared` page (Inbox/Sent), a header tray badge, and a `/s/:token` landing.

**Tech Stack:** Express + better-sqlite3 + drizzle-orm (sync driver), React 18 + wouter (hash routing) + TanStack Query v5 + shadcn/ui primitives + Tailwind, Resend REST API for the invite email, `tsx` for script tests and `node:test`.

## Global Constraints

- Flip deals only. (Server-side `deals` rows are Flip; Hold deals live in localStorage and have no share entry point.)
- Do not store phone numbers. Only `texted` (boolean) is persisted. No new SMS provider — `sms:{E164}?&body={encoded}` handoff only.
- Do not touch: Coastal Teal palette values (#126D85, ink #0a0e12, cyan #5fd4e7/#7be3f0, gold #f5c948, green #7fd4a8, red #e56666); logo geometry; `holdCalc.ts`; gateway `?gateway=skip`; unified ARV formula; snapshot internals (only call the create helper); Walkthrough Budget internals; comp tier ranking; Editable Sources & Uses logic; Comp Hero data layer + PDF; existing email drip code; safe-area header rule.
- Invite email = new standalone Resend template from `info@propboxiq.com`, subject `{Sender name} sent you a deal on PropBoxIQ`, **View deal** button → `/s/:token`.
- Note max 280 chars (counter turns red, Send disabled). Invites expire 30 days after `created_at`, computed at read time. 25 sends per sender per rolling 24h. One pending share per (source deal, recipient email).
- Copy (verbatim from spec): "They'll get their own copy to edit. Your deal stays unchanged." · "Adding a number opens your Messages app with a pre-written text and link." · "Sent to marcus@…" / "Invite emailed to dana.r@…" · "Text copied — paste into Messages." · "Deal added to your list." · "Decline this deal? The sender will see it was declined." · "You can't share this deal." · "Enter a valid email." · "You can't send a deal to yourself." · "Already sent to this person — waiting on their response." · "Daily send limit reached (25). Try again tomorrow." · "Enter a 10-digit US mobile number." · "Deal saved, but the invite email failed — share the link by text instead." · "This shared deal is no longer available."
- Mobile-first 390–430px; UI matches `deal-share-mocks.png`; no hard-coded people — all names/emails come from real user data.
- Version 1.8.0 (package.json, package-lock.json root, `shared/version.ts`, CHANGELOG, release notes — bullets verbatim from spec §11).
- Gates: `npm run check` and `npm run build` must exit 0.

## Codebase facts that shape this plan (read before Task 1)

| Spec assumption | Real codebase | Resolution |
|---|---|---|
| Separate budget / S&U tables | Walkthrough Budget = `deals.budget` JSON column; Sources & Uses overrides = `inputs.sourcesUsesOverrides` inside `deals.inputs`; saved comps = envelope in `deals.notes`; Comp Hero = `comp_hero_state` table | Payload copies the deals row (minus ids/timestamps/pin/archive), `budget`, and `comp_hero_state`; `sourcesUses`/`comps` are informational mirrors restored via `deal.inputs`/`deal.notes` |
| Drizzle migrations | No migration files — runtime DDL + `PRAGMA table_info` ALTER guards in `server/storage.ts` | Same pattern |
| Users have `avatarUrl` | `users` has `id, email, name, createdAt` | `sender.avatarUrl` is always `null`; UI shows initials (as in the mockup) |
| Three-dot menu on `QuickResult.tsx` | The `···` menu lives on `client/src/pages/Deal.tsx`; `QuickResult.tsx` has a top action row and an Export/Email row | "Send deal" in Deal.tsx `···` menu + send icon in Deal.tsx header; "Send" in QuickResult's top row + "Send deal" next to Email |
| Path-based `/s/:token` | Client uses hash routing (`useHashLocation`) | Server `GET /s/:token` → 302 `/#/s/:token` |
| Snapshot "label" | `deal_snapshots` has no label column; `SnapshotPayload` must not change | Label stored as an extra JSON field on the stored payload (`{...buildBackfillPayload(deal), label}`), surfaced by the snapshots list route and shown in place of "Original" |
| FKs on `source_deal_id` / `accepted_deal_id` | Shares must survive deletion of the source deal | No FOREIGN KEY on those two columns (user FKs kept) |
| One SQLite transaction around `storage.createSnapshot` (async) | better-sqlite3 `.transaction()` can't wrap async fns | Explicit `BEGIN IMMEDIATE … COMMIT/ROLLBACK` on the raw handle; storage helpers only await settled values, so nothing interleaves |

## File Structure

**Create**
- `shared/dealShares.ts` — constants, wire types, pure helpers (phone/email/mask/status/money/SMS body/names). Used by server + client.
- `shared/dealShares.test.ts` — `node:test` unit tests for the helpers.
- `server/dealShares.ts` — service: `createShare`, `listInbox`, `inboxCount`, `listSent`, `resolveShareToken`, `acceptShare`, `declineShare`, `withReceivedFromNames`, payload/summary builders.
- `server/emails/dealInvite.ts` — standalone invite template + Resend sender (`info@propboxiq.com`).
- `server/dealShareRoutes.ts` — HTTP routes + `/s/:token` redirect.
- `server/scripts/testDealShares.ts` — spec §8 script test (6 cases, temp DB).
- `server/scripts/testDealShareRoutes.ts` — HTTP contract smoke test.
- `client/src/lib/sms.ts` — `sms:` URI + clipboard fallback.
- `client/src/lib/shares.ts` — query keys, error unwrapping, relative time, pending-share token.
- `client/src/lib/shares.test.ts` — unit tests for the two client libs.
- `client/src/components/share/SendDealSheet.tsx`, `SharedDealCard.tsx`, `SentShareRow.tsx`, `SharePill.tsx`, `InboxTrayButton.tsx`.
- `client/src/pages/SharedDealsPage.tsx`, `client/src/pages/ShareLinkPage.tsx`.

**Modify**
- `shared/schema.ts` — `deals.receivedFromUserId`, `dealShares` table, omit new column from `insertDealSchema`.
- `server/storage.ts` — DDL, ALTER guard, `sqliteDb` export, invite linking in `upsertUser`.
- `server/routes.ts` — register share routes; `receivedFromName` on `GET /api/deals`; snapshot `label`.
- `client/src/App.tsx`, `client/src/components/AppShell.tsx`, `client/src/pages/Deal.tsx`, `client/src/pages/QuickResult.tsx`, `client/src/pages/Deals.tsx`, `client/src/components/SnapshotHistory.tsx`.
- `package.json`, `package-lock.json`, `shared/version.ts`, `CHANGELOG.md`, `shared/releaseNotes.ts`.

---

### Task 1: Shared helpers and wire types

**Files:**
- Create: `shared/dealShares.ts`
- Test: `shared/dealShares.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SHARE_NOTE_MAX=280`, `SHARE_DAILY_LIMIT=25`, `SHARE_INVITE_TTL_DAYS=30`, `DAY_MS`, `SHARE_INVITE_TTL_MS`, `SHARE_ERRORS`, types `ShareSummary`, `InboxShare`, `SentShare`, `CreateShareResponse`, `ShareTokenResolution`, `ShareDisplayStatus`; functions `normalizeShareEmail(raw: unknown): string`, `isValidShareEmail(email: string): boolean`, `normalizeUsPhone(raw: string): string | null`, `toE164(d10: string): string`, `formatUsPhone(raw: string): string`, `maskEmail(email: string): string`, `isInviteExpired(row, now): boolean`, `deriveDisplayStatus(row, now): ShareDisplayStatus`, `inviteExpiresInDays(createdAt, now): number`, `fmtShortUsd(n): string`, `buildSmsBody({street, city, arv, profit, shareUrl}): string`, `displayNameOf(name, email): string`, `initialsOf(name): string`.

- [ ] **Step 1: Write the failing test**

`shared/dealShares.test.ts` (full file):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUsPhone,
  formatUsPhone,
  toE164,
  maskEmail,
  deriveDisplayStatus,
  isInviteExpired,
  inviteExpiresInDays,
  fmtShortUsd,
  buildSmsBody,
  displayNameOf,
  initialsOf,
  normalizeShareEmail,
  isValidShareEmail,
  DAY_MS,
} from "./dealShares";

test("normalizeUsPhone accepts 10 digits and an optional leading 1", () => {
  assert.equal(normalizeUsPhone("(410) 555-0182"), "4105550182");
  assert.equal(normalizeUsPhone("+1 410.555.0182"), "4105550182");
  assert.equal(normalizeUsPhone("555-0182"), null);
  assert.equal(normalizeUsPhone("24105550182"), null);
  assert.equal(toE164("4105550182"), "+14105550182");
});

test("formatUsPhone formats as you type", () => {
  assert.equal(formatUsPhone("410"), "(410");
  assert.equal(formatUsPhone("41055"), "(410) 55");
  assert.equal(formatUsPhone("4105550182"), "(410) 555-0182");
  assert.equal(formatUsPhone("14105550182999"), "(410) 555-0182");
});

test("email normalize, validate and mask", () => {
  assert.equal(normalizeShareEmail("  Marcus@CapitalPartners.com "), "marcus@capitalpartners.com");
  assert.equal(isValidShareEmail("marcus@capitalpartners.com"), true);
  assert.equal(isValidShareEmail("marcus@"), false);
  assert.equal(maskEmail("marcus@capitalpartners.com"), "m•••@capitalpartners.com");
});

test("display status derivation", () => {
  const now = 100 * DAY_MS;
  const base = { status: "pending", invited: false, recipientUserId: 7, createdAt: now - DAY_MS };
  assert.equal(deriveDisplayStatus(base, now), "PENDING");
  assert.equal(deriveDisplayStatus({ ...base, status: "accepted" }, now), "ACCEPTED");
  assert.equal(deriveDisplayStatus({ ...base, status: "declined" }, now), "DECLINED");
  const invite = { ...base, invited: true, recipientUserId: null };
  assert.equal(deriveDisplayStatus(invite, now), "INVITED");
  assert.equal(deriveDisplayStatus({ ...invite, createdAt: now - 31 * DAY_MS }, now), "EXPIRED");
  assert.equal(isInviteExpired({ ...invite, createdAt: now - 31 * DAY_MS }, now), true);
  // A claimed invite is a normal pending share and never expires.
  assert.equal(deriveDisplayStatus({ ...invite, recipientUserId: 9, createdAt: now - 31 * DAY_MS }, now), "PENDING");
  assert.equal(inviteExpiresInDays(now - 3 * DAY_MS, now), 27);
});

test("short money and SMS body", () => {
  assert.equal(fmtShortUsd(651000), "$651K");
  assert.equal(fmtShortUsd(1_250_000), "$1.3M");
  assert.equal(fmtShortUsd(-12_400), "-$12K");
  assert.equal(
    buildSmsBody({ street: "16011 Tanyard Rd", city: "Upper Marlboro", arv: 651000, profit: 88000, shareUrl: "https://app.propboxiq.com/s/7Kq2Xa" }),
    "Hey, I just sent you a deal on PropBoxIQ:\n16011 Tanyard Rd, Upper Marlboro\nARV $651K · Est. profit $88K\nhttps://app.propboxiq.com/s/7Kq2Xa",
  );
});

test("names and initials", () => {
  assert.equal(displayNameOf("Jordan Rivera", "j@x.com"), "Jordan Rivera");
  assert.equal(displayNameOf(null, "dana.r@gmail.com"), "Dana R");
  assert.equal(initialsOf("Jordan Rivera"), "JR");
  assert.equal(initialsOf("marcus"), "M");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test shared/dealShares.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... shared/dealShares`

- [ ] **Step 3: Write the implementation**

`shared/dealShares.ts` (full file):

```ts
// Deal Sharing (v1.8.0) — pure helpers + wire types shared by server and client.
// No I/O here: everything is deterministic so it can be unit-tested and used by
// both the API (validation, display status) and the UI (formatting, masking).

export const SHARE_NOTE_MAX = 280;
export const SHARE_DAILY_LIMIT = 25;
export const SHARE_INVITE_TTL_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SHARE_INVITE_TTL_MS = SHARE_INVITE_TTL_DAYS * DAY_MS;

export type ShareStatus = "pending" | "accepted" | "declined";
export type ShareDisplayStatus = "PENDING" | "INVITED" | "ACCEPTED" | "DECLINED" | "EXPIRED";

/** Card-ready facts frozen at send time (deal_shares.summary). */
export interface ShareSummary {
  street: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  style: string | null;
  arv: number;
  profit: number;
  price: number;
}

export interface InboxShare {
  id: number;
  token: string;
  sender: { name: string; avatarUrl: string | null };
  summary: ShareSummary;
  note: string | null;
  createdAt: number;
}

export interface SentShare {
  id: number;
  summary: ShareSummary;
  recipientEmail: string;
  texted: boolean;
  invited: boolean;
  displayStatus: ShareDisplayStatus;
  createdAt: number;
  respondedAt: number | null;
  expiresInDays?: number;
}

export interface CreateShareResponse {
  shareId: number;
  token: string;
  shareUrl: string;
  displayStatus: "PENDING" | "INVITED";
  /** Present only when a phone number was sent. Server-built text body. */
  smsBody?: string;
  /** E.164 form of the phone the sender typed. Never stored server-side. */
  smsTo?: string;
  inviteEmailFailed?: boolean;
}

export interface ShareTokenResolution {
  shareId: number | null;
  state: "mine" | "other-account" | "unavailable";
  maskedEmail?: string;
}

export const SHARE_ERRORS = {
  cantShare: "You can't share this deal.",
  invalidEmail: "Enter a valid email.",
  self: "You can't send a deal to yourself.",
  duplicate: "Already sent to this person — waiting on their response.",
  dailyLimit: `Daily send limit reached (${SHARE_DAILY_LIMIT}). Try again tomorrow.`,
  note: `Notes can be up to ${SHARE_NOTE_MAX} characters.`,
  phone: "Enter a 10-digit US mobile number.",
  unavailable: "This shared deal is no longer available.",
  forbidden: "This shared deal was sent to a different account.",
} as const;

export function normalizeShareEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidShareEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Returns the 10 US digits, or null. Accepts formatting and an optional leading 1. */
export function normalizeUsPhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function toE164(digits10: string): string {
  return `+1${digits10}`;
}

/** As-you-type display formatting: "(410) 555-0182". */
export function formatUsPhone(raw: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length >= 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** "marcus@capitalpartners.com" → "m•••@capitalpartners.com". */
export function maskEmail(email: string): string {
  const [local, domain] = String(email ?? "").split("@");
  if (!domain) return "•••";
  return `${(local ?? "").charAt(0)}•••@${domain}`;
}

export interface ShareStatusFields {
  status: string;
  invited: boolean;
  recipientUserId: number | null;
  createdAt: number;
}

/** An invite (no account at send time, still unclaimed) older than 30 days. */
export function isInviteExpired(row: ShareStatusFields, now: number): boolean {
  return (
    row.status === "pending" &&
    row.invited &&
    row.recipientUserId == null &&
    now - row.createdAt > SHARE_INVITE_TTL_MS
  );
}

export function deriveDisplayStatus(row: ShareStatusFields, now: number): ShareDisplayStatus {
  if (row.status === "accepted") return "ACCEPTED";
  if (row.status === "declined") return "DECLINED";
  if (row.invited && row.recipientUserId == null) {
    return isInviteExpired(row, now) ? "EXPIRED" : "INVITED";
  }
  return "PENDING";
}

export function inviteExpiresInDays(createdAt: number, now: number): number {
  return Math.max(0, Math.ceil((createdAt + SHARE_INVITE_TTL_MS - now) / DAY_MS));
}

/** $651K · $1.2M · $950 · -$12K */
export function fmtShortUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function buildSmsBody(opts: {
  street: string;
  city: string | null;
  arv: number;
  profit: number;
  shareUrl: string;
}): string {
  const place = opts.city ? `${opts.street}, ${opts.city}` : opts.street;
  return [
    "Hey, I just sent you a deal on PropBoxIQ:",
    place,
    `ARV ${fmtShortUsd(opts.arv)} · Est. profit ${fmtShortUsd(opts.profit)}`,
    opts.shareUrl,
  ].join("\n");
}

/** Friendly display name: stored name, else title-cased email local part. */
export function displayNameOf(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n;
  const local = String(email ?? "").split("@")[0] ?? "";
  const words = local.split(/[._-]+/).filter(Boolean);
  if (words.length === 0) return "PropBoxIQ user";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** "Jordan Rivera" → "JR"; "marcus" → "M". */
export function initialsOf(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test shared/dealShares.test.ts`
Expected: `# pass 6`, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add shared/dealShares.ts shared/dealShares.test.ts
git commit -m "feat(shares): shared helpers + wire types for deal sharing"
```

---

### Task 2: Data model, share service, invite email (spec §8 test)

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/storage.ts`
- Create: `server/emails/dealInvite.ts`
- Create: `server/dealShares.ts`
- Test: `server/scripts/testDealShares.ts`

**Interfaces:**
- Consumes: Task 1; existing `storage.getDeal/getUserById/getUserByEmail/getCompHeroState/createSnapshot`, `buildBackfillPayload` (server/snapshots.ts), `calculateDeal` (client/src/lib/calc.ts), `COLORS/ctaButton/card/APP_ORIGIN` (server/emails/layout.ts, read-only).
- Produces: `dealShares` drizzle table + `DealShare` type; `sqliteDb` export; `ShareResult<T> = {ok:true,value:T} | {ok:false,status:number,error:string}`; `createShare(senderId, dealId, body, opts?: {now?, sendInvite?}) → ShareResult<CreateShareResponse>`; `listInbox(userId, now?) → InboxShare[]`; `inboxCount(userId, now?) → number`; `listSent(userId, now?) → SentShare[]`; `resolveShareToken(userId, token, now?) → ShareTokenResolution`; `acceptShare(userId, shareId, now?) → ShareResult<{dealId}>`; `declineShare(userId, shareId, now?) → ShareResult<{ok:true}>`; `withReceivedFromNames(deals)`; `shareUrlFor(token)`; `InviteSender`; `dealInviteEmail(input) → {subject, html, text}`; `sendDealInviteEmail`.

- [ ] **Step 1: Write the failing script test (all 6 spec cases)**

`server/scripts/testDealShares.ts` (full file):

```ts
// v1.8.0 Deal Sharing — script-level test against a temp SQLite DB (spec §8).
//
//   npx tsx server/scripts/testDealShares.ts
//
// DATA_DIR is pointed at a fresh temp dir BEFORE storage is imported, so the
// real bootstrap DDL (users / deals / comp_hero_state / deal_snapshots /
// deal_shares) runs exactly as it does on boot. No network: the invite email
// sender is injected.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "pbq-shares-"));
  process.env.DATA_DIR = dir;
  delete process.env.RESEND_API_KEY;
  process.env.SHARE_BASE_URL = "https://app.propboxiq.com";

  const { storage, db } = await import("../storage");
  const shares = await import("../dealShares");
  const { dealShares, deals, defaultDealInputs } = await import("@shared/schema");
  const { calculateDeal } = await import("@/lib/calc");
  const { createDefaultBudget, normalizeBudget, budgetGrandTotal } = await import("@shared/budgetTemplate");
  const { DAY_MS, SHARE_ERRORS } = await import("@shared/dealShares");
  const { eq } = await import("drizzle-orm");

  type DealRow = typeof deals.$inferSelect;

  let passed = 0;
  let failed = 0;
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${name}\n      ${(e as Error).stack?.split("\n").slice(0, 3).join("\n      ")}`);
    }
  }

  const sentInvites: string[] = [];
  const okInvite = async (m: { to: string }) => {
    sentInvites.push(m.to);
    return { ok: true };
  };
  const failingInvite = async () => ({ ok: false, error: "resend 500" });

  function metrics(deal: DealRow) {
    const inputs = { ...defaultDealInputs, ...JSON.parse(deal.inputs) };
    const r = calculateDeal(inputs, { state: deal.state, city: deal.city });
    const budget = deal.budget ? budgetGrandTotal(normalizeBudget(JSON.parse(deal.budget))) : 0;
    return { arv: inputs.arv, profit: r.netProfit, budget, sourcesUses: inputs.sourcesUsesOverrides ?? null };
  }

  function valueOf<T>(r: { ok: true; value: T } | { ok: false; status: number; error: string }): T {
    if (!r.ok) throw new Error(`expected ok, got ${r.status} ${r.error}`);
    return r.value;
  }

  async function makeDeal(userId: number, address: string, arv = 651000) {
    const budget = createDefaultBudget();
    budget.categories.kitchen.items[0].amount = 18500;
    budget.categories.exterior.items[3].amount = 14200;
    budget.categories.trades.items[1].amount = 9800;
    return storage.createDeal(userId, {
      address,
      city: "Upper Marlboro",
      state: "MD",
      zip: "20772",
      sqft: 2061,
      beds: 4,
      baths: 2.5,
      inputs: JSON.stringify({
        ...defaultDealInputs,
        purchasePrice: 385000,
        arv,
        rehabBudget: 42500,
        sourcesUsesOverrides: { holding: 7200, buyClosingItems: { "Title insurance": 1650 } },
      }),
      notes: JSON.stringify({
        kind: "comps",
        version: 1,
        compsData: { subject: { address, sqft: 2061, style: "Colonial" }, comps: [{ id: "c1", price: 640000 }], arv },
        excludedCompIds: [],
      }),
      budget: JSON.stringify(budget),
    });
  }

  const { user: jordan } = await storage.upsertUser("jordan.rivera@example.com", "Jordan Rivera");
  const { user: marcus } = await storage.upsertUser("marcus@capitalpartners.com", "Marcus Lee");
  const { user: outsider } = await storage.upsertUser("sam.outsider@example.com", "Sam Outsider");

  // ── 1 ────────────────────────────────────────────────────────────────────
  await check("1. send → accept: recipient ARV, profit, budget, S&U, Comp Hero equal sender's at send time", async () => {
    const deal = await makeDeal(jordan.id, "16011 Tanyard Rd");
    await storage.upsertCompHeroState(deal.id, {
      selectedCompKeys: JSON.stringify(["c1", "c2"]),
      manualComps: JSON.stringify([{ id: "m1", source: "manual-address", address: "1 Main St" }]),
    });
    const atSend = metrics(deal);
    const sent = valueOf(await shares.createShare(jordan.id, deal.id, { email: " Marcus@CapitalPartners.com ", note: "Take a look at this one, comps are tight in Upper Marlboro." }, { sendInvite: okInvite }));
    assert.equal(sent.displayStatus, "PENDING");
    assert.match(sent.shareUrl, /^https:\/\/app\.propboxiq\.com\/s\/[A-Za-z0-9_-]{10}$/);
    assert.equal(sent.smsBody, undefined);

    const inbox = await shares.listInbox(marcus.id);
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].sender.name, "Jordan Rivera");
    assert.equal(inbox[0].summary.style, "Colonial");
    assert.equal(inbox[0].summary.arv, 651000);
    assert.equal(await shares.inboxCount(marcus.id), 1);

    const { dealId } = valueOf(await shares.acceptShare(marcus.id, sent.shareId));
    const copy = (await storage.getDeal(dealId, marcus.id))!;
    assert.ok(copy, "recipient owns the copy");
    assert.notEqual(copy.id, deal.id);
    assert.equal(copy.receivedFromUserId, jordan.id);
    assert.deepEqual(metrics(copy), atSend);
    assert.equal(copy.notes, deal.notes, "comps envelope copied");
    const ch = await storage.getCompHeroState(dealId);
    assert.equal(ch?.selectedCompKeys, JSON.stringify(["c1", "c2"]));
    assert.ok(ch?.manualComps.includes("1 Main St"));
    const snaps = await storage.listSnapshots(dealId);
    assert.equal(snaps.length, 1, "exactly one snapshot, history not copied");
    assert.equal(snaps[0].isOriginal, true);
    assert.equal(JSON.parse(snaps[0].payload).label, "Received from Jordan Rivera");
    assert.equal(await shares.inboxCount(marcus.id), 0);
    const sentList = await shares.listSent(jordan.id);
    assert.equal(sentList.find((s) => s.id === sent.shareId)?.displayStatus, "ACCEPTED");
    // Sender's deal untouched.
    assert.deepEqual(metrics((await storage.getDeal(deal.id, jordan.id))!), atSend);
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  await check("2. sender edits after sending → recipient copy unchanged", async () => {
    const deal = await makeDeal(jordan.id, "7725 Carroll Ave");
    const atSend = metrics(deal);
    const sent = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com" }, { sendInvite: okInvite }));
    const editedBudget = normalizeBudget(JSON.parse(deal.budget!));
    editedBudget.categories.kitchen.items[0].amount = 99999;
    await storage.updateDeal(deal.id, jordan.id, {
      inputs: JSON.stringify({ ...JSON.parse(deal.inputs), arv: 720000, purchasePrice: 300000 }),
      budget: JSON.stringify(editedBudget),
    });
    await storage.upsertCompHeroState(deal.id, { selectedCompKeys: JSON.stringify(["changed"]) });
    const { dealId } = valueOf(await shares.acceptShare(marcus.id, sent.shareId));
    const copy = (await storage.getDeal(dealId, marcus.id))!;
    assert.deepEqual(metrics(copy), atSend);
    assert.notDeepEqual(metrics((await storage.getDeal(deal.id, jordan.id))!), atSend);
    assert.equal(await storage.getCompHeroState(dealId), undefined, "no Comp Hero state at send time → none copied");
    // Editing the sender deal again leaves the accepted copy alone.
    await storage.updateDeal(deal.id, jordan.id, { address: "renamed" });
    assert.equal((await storage.getDeal(dealId, marcus.id))!.address, "7725 Carroll Ave");
  });

  // ── 3 ────────────────────────────────────────────────────────────────────
  await check("3. duplicate pending rejected; 26th send in 24h rejected; self-send rejected", async () => {
    const deal = await makeDeal(jordan.id, "1126 Chevron Rd");
    valueOf(await shares.createShare(jordan.id, deal.id, { email: "tony@dmvbuild.com" }, { sendInvite: okInvite }));
    const dup = await shares.createShare(jordan.id, deal.id, { email: "TONY@dmvbuild.com" }, { sendInvite: okInvite });
    assert.deepEqual(dup, { ok: false, status: 409, error: SHARE_ERRORS.duplicate });

    const self = await shares.createShare(jordan.id, deal.id, { email: "Jordan.Rivera@example.com" }, { sendInvite: okInvite });
    assert.deepEqual(self, { ok: false, status: 400, error: SHARE_ERRORS.self });

    const bad = await shares.createShare(jordan.id, deal.id, { email: "not-an-email" });
    assert.deepEqual(bad, { ok: false, status: 400, error: SHARE_ERRORS.invalidEmail });
    const phone = await shares.createShare(jordan.id, deal.id, { email: "p@x.com", phone: "555-0182" });
    assert.deepEqual(phone, { ok: false, status: 400, error: SHARE_ERRORS.phone });
    const note = await shares.createShare(jordan.id, deal.id, { email: "p@x.com", note: "x".repeat(281) });
    assert.deepEqual(note, { ok: false, status: 400, error: SHARE_ERRORS.note });
    const notMine = await shares.createShare(outsider.id, deal.id, { email: "p@x.com" });
    assert.deepEqual(notMine, { ok: false, status: 404, error: SHARE_ERRORS.cantShare });

    const texted = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com", phone: "(410) 555-0182" }, { sendInvite: okInvite }));
    assert.equal(texted.smsTo, "+14105550182");
    assert.ok(texted.smsBody?.startsWith("Hey, I just sent you a deal on PropBoxIQ:\n1126 Chevron Rd, Upper Marlboro\nARV $651K · Est. profit "));
    assert.ok(texted.smsBody?.endsWith(texted.shareUrl));
    const row = (await shares.listSent(jordan.id)).find((s) => s.id === texted.shareId)!;
    assert.equal(row.texted, true);
    const rawCols = db.select().from(dealShares).where(eq(dealShares.id, texted.shareId)).get()!;
    assert.ok(!JSON.stringify(rawCols).includes("5550182"), "phone number is never stored");

    // Rate limit: a fresh sender with 25 sends in the window.
    const { user: busy } = await storage.upsertUser("busy.sender@example.com", "Busy Sender");
    const busyDeal = await makeDeal(busy.id, "9 Rate Limit Ln");
    for (let i = 1; i <= 25; i++) {
      valueOf(await shares.createShare(busy.id, busyDeal.id, { email: `lead${i}@example.com` }, { sendInvite: okInvite }));
    }
    const over = await shares.createShare(busy.id, busyDeal.id, { email: "lead26@example.com" }, { sendInvite: okInvite });
    assert.deepEqual(over, { ok: false, status: 429, error: SHARE_ERRORS.dailyLimit });
    // Rolling window: once the oldest send is >24h old, sending works again.
    db.update(dealShares).set({ createdAt: Date.now() - DAY_MS - 1000 }).where(eq(dealShares.recipientEmail, "lead1@example.com")).run();
    valueOf(await shares.createShare(busy.id, busyDeal.id, { email: "lead26@example.com" }, { sendInvite: okInvite }));
  });

  // ── 4 ────────────────────────────────────────────────────────────────────
  await check("4. invite unknown email → INVITED; signup links it to inbox; 31-day-old invite → EXPIRED + accept 409", async () => {
    const deal = await makeDeal(jordan.id, "1254 Washington Dr");
    const before = sentInvites.length;
    const inv = valueOf(await shares.createShare(jordan.id, deal.id, { email: "dana.r@gmail.com" }, { sendInvite: okInvite }));
    assert.equal(inv.displayStatus, "INVITED");
    assert.equal(sentInvites.length, before + 1);
    assert.equal(sentInvites.at(-1), "dana.r@gmail.com");
    let row = (await shares.listSent(jordan.id)).find((s) => s.id === inv.shareId)!;
    assert.equal(row.displayStatus, "INVITED");
    assert.equal(row.expiresInDays, 30);

    const { user: dana, isNew } = await storage.upsertUser("Dana.R@gmail.com", "Dana Reyes");
    assert.equal(isNew, true);
    const danaInbox = await shares.listInbox(dana.id);
    assert.deepEqual(danaInbox.map((s) => s.id), [inv.shareId]);
    assert.equal(db.select().from(dealShares).where(eq(dealShares.id, inv.shareId)).get()!.recipientUserId, dana.id);
    row = (await shares.listSent(jordan.id)).find((s) => s.id === inv.shareId)!;
    assert.equal(row.displayStatus, "PENDING");

    const failedMail = await shares.createShare(jordan.id, deal.id, { email: "bounce@example.com" }, { sendInvite: failingInvite });
    assert.equal(valueOf(failedMail).inviteEmailFailed, true, "share still created when Resend fails");

    const old = valueOf(await shares.createShare(jordan.id, deal.id, { email: "old.invite@example.com" }, { sendInvite: okInvite }));
    db.update(dealShares).set({ createdAt: Date.now() - 31 * DAY_MS }).where(eq(dealShares.id, old.shareId)).run();
    row = (await shares.listSent(jordan.id)).find((s) => s.id === old.shareId)!;
    assert.equal(row.displayStatus, "EXPIRED");
    const { user: late } = await storage.upsertUser("old.invite@example.com", "Late Signup");
    assert.equal((await shares.listInbox(late.id)).length, 0, "expired invite does not appear");
    const acc = await shares.acceptShare(late.id, old.shareId);
    assert.deepEqual(acc, { ok: false, status: 409, error: SHARE_ERRORS.unavailable });
    const tok = await shares.resolveShareToken(late.id, old.token);
    assert.equal(tok.state, "unavailable");
    // Expired invites no longer block a fresh send to the same person.
    valueOf(await shares.createShare(jordan.id, deal.id, { email: "old.invite@example.com" }, { sendInvite: okInvite }));
  });

  // ── 5 ────────────────────────────────────────────────────────────────────
  await check("5. non-recipient accept or decline → 403", async () => {
    const deal = await makeDeal(jordan.id, "911 Hollis Ct");
    const s = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com" }, { sendInvite: okInvite }));
    assert.deepEqual(await shares.acceptShare(outsider.id, s.shareId), { ok: false, status: 403, error: SHARE_ERRORS.forbidden });
    assert.deepEqual(await shares.declineShare(outsider.id, s.shareId), { ok: false, status: 403, error: SHARE_ERRORS.forbidden });
    assert.deepEqual(await shares.acceptShare(jordan.id, s.shareId), { ok: false, status: 403, error: SHARE_ERRORS.forbidden }, "sender can't accept own share");
    const other = await shares.resolveShareToken(outsider.id, s.token);
    assert.deepEqual(other, { shareId: s.shareId, state: "other-account", maskedEmail: "m•••@capitalpartners.com" });
    const mine = await shares.resolveShareToken(marcus.id, s.token);
    assert.deepEqual(mine, { shareId: s.shareId, state: "mine" });
    assert.equal((await shares.resolveShareToken(marcus.id, "nope")).state, "unavailable");
    // Recipient declines → DECLINED for sender; further actions 409.
    assert.deepEqual(await shares.declineShare(marcus.id, s.shareId), { ok: true, value: { ok: true } });
    assert.equal((await shares.listSent(jordan.id)).find((x) => x.id === s.shareId)?.displayStatus, "DECLINED");
    assert.deepEqual(await shares.acceptShare(marcus.id, s.shareId), { ok: false, status: 409, error: SHARE_ERRORS.unavailable });
    assert.deepEqual(await shares.declineShare(marcus.id, s.shareId), { ok: false, status: 409, error: SHARE_ERRORS.unavailable });
    assert.equal((await shares.resolveShareToken(marcus.id, s.token)).state, "unavailable");
  });

  // ── 6 ────────────────────────────────────────────────────────────────────
  await check("6. deleting the source deal doesn't break accepting", async () => {
    const deal = await makeDeal(jordan.id, "42 Deleted Way", 512000);
    const atSend = metrics(deal);
    const s = valueOf(await shares.createShare(jordan.id, deal.id, { email: "marcus@capitalpartners.com" }, { sendInvite: okInvite }));
    assert.equal(await storage.deleteDeal(deal.id, jordan.id), true);
    const sentRow = (await shares.listSent(jordan.id)).find((x) => x.id === s.shareId)!;
    assert.equal(sentRow.summary.street, "42 Deleted Way", "Sent tab still renders from the frozen summary");
    const { dealId } = valueOf(await shares.acceptShare(marcus.id, s.shareId));
    assert.deepEqual(metrics((await storage.getDeal(dealId, marcus.id))!), atSend);
  });

  console.log(`\n${passed} passed, ${failed} failed  (temp DB: ${dir})`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx server/scripts/testDealShares.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... server/dealShares`

- [ ] **Step 3: Schema — add the column and table**

`shared/schema.ts` (exact diff against main):

```diff
diff --git a/shared/schema.ts b/shared/schema.ts
index e178b3f..7189226 100644
--- a/shared/schema.ts
+++ b/shared/schema.ts
@@ -85,6 +85,9 @@ export const deals = sqliteTable("deals", {
   // Tracks the last time the user opened/viewed this deal (vs updatedAt which
   // bumps on every PATCH). Powers the "Recently viewed" sort.
   lastOpenedAt: integer("last_opened_at"),
+  // v1.8.0 Deal Sharing: set on a recipient's accepted copy so the deal list
+  // can show a small "From {name}" tag. Null for deals the user created.
+  receivedFromUserId: integer("received_from_user_id"),
   createdAt: integer("created_at").notNull(),
   updatedAt: integer("updated_at").notNull(),
 });
@@ -93,6 +96,8 @@ export const insertDealSchema = createInsertSchema(deals).omit({
   id: true,
   createdAt: true,
   updatedAt: true,
+  // Server-owned: only the share-accept transaction sets this.
+  receivedFromUserId: true,
 });
 
 export type InsertDeal = z.infer<typeof insertDealSchema>;
@@ -115,6 +120,31 @@ export const dealSnapshots = sqliteTable("deal_snapshots", {
 export type DealSnapshot = typeof dealSnapshots.$inferSelect;
 export type InsertDealSnapshot = typeof dealSnapshots.$inferInsert;
 
+// Deal Sharing (v1.8.0). One row per "Send deal". `payload` is the frozen JSON
+// bundle (SharePayloadV1) the recipient's copy is built from on accept, so the
+// share keeps working even if the sender edits or deletes the source deal.
+// `summary` is the card-ready ShareSummary. The phone number is never stored —
+// only `texted` records that the sender used the SMS handoff.
+export const dealShares = sqliteTable("deal_shares", {
+  id: integer("id").primaryKey({ autoIncrement: true }),
+  token: text("token").notNull().unique(),
+  senderUserId: integer("sender_user_id").notNull(),
+  sourceDealId: integer("source_deal_id").notNull(),
+  recipientEmail: text("recipient_email").notNull(),
+  recipientUserId: integer("recipient_user_id"),
+  invited: integer("invited", { mode: "boolean" }).notNull().default(false),
+  texted: integer("texted", { mode: "boolean" }).notNull().default(false),
+  note: text("note"),
+  payload: text("payload").notNull(),
+  summary: text("summary").notNull(),
+  status: text("status").notNull().default("pending"), // pending | accepted | declined
+  acceptedDealId: integer("accepted_deal_id"),
+  createdAt: integer("created_at").notNull(),
+  respondedAt: integer("responded_at"),
+});
+
+export type DealShare = typeof dealShares.$inferSelect;
+
 // Manual per-row edits made in the "Where the money goes" (Sources & Uses)
 // card. Only the terminal cost rows appear here: purchase price and rehab write
 // straight back to their primitive inputs so the formulas that depend on them
```

- [ ] **Step 4: Storage — DDL, ALTER guard, raw handle, invite linking**

`server/storage.ts` (exact diff against main):

```diff
diff --git a/server/storage.ts b/server/storage.ts
index 6366cef..16bf546 100644
--- a/server/storage.ts
+++ b/server/storage.ts
@@ -1,4 +1,5 @@
 import { deals, users, magicTokens, sessions, dealSnapshots, compHeroState } from '@shared/schema';
+import { SHARE_INVITE_TTL_MS } from '@shared/dealShares';
 import type { Deal, InsertDeal, User, MagicToken, Session, DealSnapshot, CompHeroStateRow } from '@shared/schema';
 import { drizzle } from "drizzle-orm/better-sqlite3";
 import Database from "better-sqlite3";
@@ -17,6 +18,9 @@ const sqlite = new Database(DB_PATH);
 sqlite.pragma("journal_mode = WAL");
 
 export const db = drizzle(sqlite);
+// Raw handle for the few call sites that need explicit BEGIN/COMMIT around
+// async storage helpers (v1.8.0 share accept).
+export const sqliteDb = sqlite;
 
 // Bootstrap schema on startup (no migrations setup)
 sqlite.exec(`
@@ -102,6 +106,37 @@ sqlite.exec(`
   );
 `);
 
+// v1.8.0 Deal Sharing. Same runtime CREATE-IF-NOT-EXISTS pattern as the
+// tables above (no migration files). source_deal_id / accepted_deal_id are
+// intentionally NOT declared as FOREIGN KEYs: the share must keep working
+// after the sender deletes the source deal (the payload is frozen).
+try {
+  sqlite.exec(`
+    CREATE TABLE IF NOT EXISTS deal_shares (
+      id INTEGER PRIMARY KEY AUTOINCREMENT,
+      token TEXT NOT NULL UNIQUE,
+      sender_user_id INTEGER NOT NULL REFERENCES users(id),
+      source_deal_id INTEGER NOT NULL,
+      recipient_email TEXT NOT NULL,
+      recipient_user_id INTEGER REFERENCES users(id),
+      invited INTEGER NOT NULL DEFAULT 0,
+      texted INTEGER NOT NULL DEFAULT 0,
+      note TEXT,
+      payload TEXT NOT NULL,
+      summary TEXT NOT NULL,
+      status TEXT NOT NULL DEFAULT 'pending',
+      accepted_deal_id INTEGER,
+      created_at INTEGER NOT NULL,
+      responded_at INTEGER
+    );
+    CREATE INDEX IF NOT EXISTS idx_deal_shares_recipient ON deal_shares(recipient_email, status);
+    CREATE INDEX IF NOT EXISTS idx_deal_shares_sender ON deal_shares(sender_user_id, created_at);
+    CREATE INDEX IF NOT EXISTS idx_deal_shares_token ON deal_shares(token);
+  `);
+} catch (e) {
+  console.warn("deal_shares migration skipped:", e);
+}
+
 // v1.7.4 migration guard: comp_hero_state table (same runtime-ALTER pattern as
 // prior releases — CREATE TABLE IF NOT EXISTS above already covers fresh boots;
 // this guard exists for older data.db files that predate the bootstrap block
@@ -140,6 +175,8 @@ for (const [col, ddl] of [
   ["last_opened_at", "ALTER TABLE deals ADD COLUMN last_opened_at INTEGER;"],
   // v1.6.1: Walkthrough Budget line items (JSON).
   ["budget", "ALTER TABLE deals ADD COLUMN budget TEXT;"],
+  // v1.8.0: "From {name}" tag on accepted shared-deal copies.
+  ["received_from_user_id", "ALTER TABLE deals ADD COLUMN received_from_user_id INTEGER;"],
 ] as const) {
   try {
     const cols = sqlite.prepare("PRAGMA table_info(deals)").all() as Array<{ name: string }>;
@@ -467,6 +504,32 @@ export class DatabaseStorage implements IStorage {
   }
 
   async upsertUser(email: string, name?: string | null): Promise<{ user: User; isNew: boolean }> {
+    const result = await this.upsertUserRow(email, name);
+    this.linkPendingShares(result.user);
+    return result;
+  }
+
+  /**
+   * v1.8.0 Deal Sharing: claim every still-valid pending share addressed to
+   * this email (invites sent before the account existed). Expired invites
+   * (> 30 days, still unclaimed) are left alone so they stay EXPIRED.
+   * Idempotent — safe to run on every sign-in.
+   */
+  private linkPendingShares(user: User): void {
+    try {
+      sqlite
+        .prepare(
+          `UPDATE deal_shares SET recipient_user_id = ?
+           WHERE recipient_user_id IS NULL AND status = 'pending'
+             AND recipient_email = ? AND created_at >= ?`,
+        )
+        .run(user.id, user.email.toLowerCase(), Date.now() - SHARE_INVITE_TTL_MS);
+    } catch (e) {
+      console.warn("[storage] linkPendingShares failed:", e);
+    }
+  }
+
+  private async upsertUserRow(email: string, name?: string | null): Promise<{ user: User; isNew: boolean }> {
     const lower = email.toLowerCase().trim();
     const existing = await this.getUserByEmail(lower);
     if (existing) {
```

- [ ] **Step 5: Invite email template (new, standalone)**

`server/emails/dealInvite.ts` (full file):

```ts
// v1.8.0 Deal Sharing — standalone invite email for recipients who don't have
// a PropBoxIQ account yet. Sent from info@propboxiq.com via Resend.
//
// This is a NEW template: it reuses the drip emails' read-only styling
// primitives (COLORS, ctaButton, card) from ./layout but does not touch the
// drip code, its shell(), or its unsubscribe flow (invitees aren't subscribers).
import { COLORS, ctaButton, card } from "./layout";
import { fmtShortUsd, type ShareSummary } from "@shared/dealShares";

export const DEAL_INVITE_FROM = "PropBoxIQ <info@propboxiq.com>";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface DealInviteEmailInput {
  senderName: string;
  summary: ShareSummary;
  note: string | null;
  shareUrl: string;
}

export interface DealInviteEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Same logo markup/geometry as the drip layout (copied, not modified).
function logo(): string {
  return `<span style="display:inline-flex;align-items:center;gap:8px;font-size:20px;font-weight:600;letter-spacing:-0.01em;color:${COLORS.body};">
    <svg width="30" height="30" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
      <rect x="42" y="6" width="32" height="32" rx="4" fill="${COLORS.body}"/>
      <rect x="6" y="42" width="32" height="32" rx="4" fill="${COLORS.body}"/>
      <rect x="42" y="42" width="32" height="32" rx="4" fill="${COLORS.primary}"/>
      <path fill-rule="evenodd" clip-rule="evenodd"
        d="M10 6 L34 6 Q38 6 38 10 L38 34 Q38 38 34 38 L10 38 Q6 38 6 34 L6 10 Q6 6 10 6 Z M21.30 15.10 Q22.00 14.60 22.70 15.10 L30.00 20.90 L30.00 32.60 Q30.00 38.00 31.50 38.00 L12.50 38.00 Q14.00 38.00 14.00 32.60 L14.00 20.90 L21.30 15.10 Z"
        fill="${COLORS.body}"/>
    </svg>
    <span>PropBox<span style="color:${COLORS.cyan}">IQ</span></span>
  </span>`;
}

export function dealInviteEmail(i: DealInviteEmailInput): DealInviteEmail {
  const subject = `${i.senderName} sent you a deal on PropBoxIQ`;
  const s = i.summary;
  const place = [s.city, s.state].filter(Boolean).join(", ");
  const arv = fmtShortUsd(s.arv);
  const profit = fmtShortUsd(s.profit);
  const noteHtml = i.note
    ? `<p style="margin:14px 0 0;padding:10px 12px;border-left:2px solid ${COLORS.cyan};background:${COLORS.ink};font-family:${FONT};font-size:14px;line-height:1.5;color:${COLORS.body};white-space:pre-wrap;">${esc(i.note)}</p>`
    : "";
  const dealCard = card(
    esc(s.street),
    `<div style="color:${COLORS.muted};font-size:13px;margin:-4px 0 10px;">${esc(place)}</div>
     <div><strong>ARV ${arv}</strong> &nbsp;&middot;&nbsp; Est. profit <strong style="color:#7fd4a8;">${profit}</strong></div>
     ${noteHtml}`,
  );

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;font-weight:700;letter-spacing:-0.02em;line-height:1.25;color:${COLORS.body};">
      ${esc(i.senderName)} sent you a deal
    </h1>
    <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.6;color:${COLORS.body};">
      Sign in to PropBoxIQ with this email address to get your own editable copy of the analysis — inputs, ARV and comps, Sources &amp; Uses, Walkthrough Budget, and Comp Hero.
    </p>
    ${dealCard}
    ${ctaButton("View deal", i.shareUrl)}
    <p style="margin:18px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};">
      This invite expires in 30 days. If the button doesn't work, paste this link into your browser:<br>
      <a href="${i.shareUrl}" style="color:${COLORS.cyan};word-break:break-all;">${i.shareUrl}</a>
    </p>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${COLORS.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(s.street)} · ARV ${arv} · Est. profit ${profit}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.ink};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 8px 28px;">${logo()}</td></tr>
        <tr><td style="padding:0 8px;">${bodyHtml}
          <p style="margin:36px 0 0;padding-top:20px;border-top:1px solid ${COLORS.border};font-family:${FONT};font-size:12px;line-height:1.6;color:${COLORS.muted};">
            You received this because ${esc(i.senderName)} shared a deal with this address on PropBoxIQ. No account is created unless you sign in.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${i.senderName} sent you a deal on PropBoxIQ`,
    "",
    `${s.street}${place ? `, ${place}` : ""}`,
    `ARV ${arv} · Est. profit ${profit}`,
    i.note ? `\n"${i.note}"` : "",
    "",
    `View deal: ${i.shareUrl}`,
    "",
    "Sign in with this email address to get your own editable copy. This invite expires in 30 days.",
  ].join("\n");

  return { subject, html, text };
}

export type InviteSender = (msg: { to: string } & DealInviteEmail) => Promise<{ ok: boolean; error?: string }>;

/** POST to Resend. Missing RESEND_API_KEY → log and report success (dev parity with auth.ts). */
export const sendDealInviteEmail: InviteSender = async (msg) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[deal-share] RESEND_API_KEY missing — invite logged only:", msg.to, msg.subject);
    return { ok: true };
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: DEAL_INVITE_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!resp.ok) {
      console.error("[deal-share] Resend error", resp.status, await resp.text());
      return { ok: false, error: `Email send failed (${resp.status})` };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[deal-share] Resend exception", e);
    return { ok: false, error: e?.message ?? "Email send failed" };
  }
};
```

- [ ] **Step 6: Share service**

`server/dealShares.ts` (full file):

```ts
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx tsx server/scripts/testDealShares.ts`
Expected: six `PASS` lines and `6 passed, 0 failed`.

Mutation check (proves the tests bite): change `if (payload.compHero) {` to `if (false && payload.compHero) {` → case 1 FAILs; comment out `this.linkPendingShares(result.user);` → case 4 FAILs. Revert both.

- [ ] **Step 8: Commit**

```bash
git add shared/schema.ts server/storage.ts server/emails/dealInvite.ts server/dealShares.ts server/scripts/testDealShares.ts
git commit -m "feat(shares): deal_shares table, share service, invite email + spec §8 script test"
```

---

### Task 3: HTTP routes

**Files:**
- Create: `server/dealShareRoutes.ts`
- Modify: `server/routes.ts`
- Test: `server/scripts/testDealShareRoutes.ts`

**Interfaces:**
- Consumes: Task 2 service functions; `requireAuth` from `server/auth.ts`.
- Produces: `registerDealShareRoutes(app: Express)`; `POST /api/deals/:id/share` (201 `CreateShareResponse`), `GET /api/shares/inbox`, `GET /api/shares/inbox/count` (`{count}`), `GET /api/shares/sent`, `POST /api/shares/:id/accept` (`{dealId}`), `POST /api/shares/:id/decline` (`{ok:true}`), `GET /api/shares/by-token/:token`, `GET /s/:token` (302 → `/#/s/:token`). Errors are `{error: string}` with 400/403/404/409/429.

- [ ] **Step 1: Write the failing route test**

`server/scripts/testDealShareRoutes.ts` (full file):

```ts
// v1.8.0 Deal Sharing — HTTP contract smoke test for server/dealShareRoutes.ts.
//
//   npx tsx server/scripts/testDealShareRoutes.ts
//
// Mounts only the share routes on a bare Express app with a test-only
// middleware that sets req.userId from an `x-test-user` header (stands in for
// sessionMiddleware), against a temp SQLite DB.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "pbq-share-routes-"));
  process.env.DATA_DIR = dir;
  delete process.env.RESEND_API_KEY;
  delete process.env.ENABLE_AUTH;

  const express = (await import("express")).default;
  const { storage } = await import("../storage");
  const { registerDealShareRoutes } = await import("../dealShareRoutes");
  const { defaultDealInputs } = await import("@shared/schema");
  const { SHARE_ERRORS } = await import("@shared/dealShares");

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = Number(req.headers["x-test-user"]);
    next();
  });
  registerDealShareRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(user: number, method: string, url: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      redirect: "manual",
      headers: { "x-test-user": String(user), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* redirect/html */ }
    return { status: res.status, json, location: res.headers.get("location") };
  }

  let failed = 0;
  try {
    const { user: a } = await storage.upsertUser("jordan.rivera@example.com", "Jordan Rivera");
    const { user: b } = await storage.upsertUser("marcus@capitalpartners.com", "Marcus Lee");
    const deal = await storage.createDeal(a.id, {
      address: "16011 Tanyard Rd", city: "Upper Marlboro", state: "MD", zip: "20772",
      inputs: JSON.stringify({ ...defaultDealInputs, purchasePrice: 385000, arv: 651000, rehabBudget: 60000 }),
    });

    let r = await call(a.id, "POST", `/api/deals/${deal.id}/share`, { email: "marcus@capitalpartners.com", phone: "410-555-0182", note: "Comps are tight." });
    assert.equal(r.status, 201);
    assert.equal(r.json.displayStatus, "PENDING");
    assert.equal(r.json.smsTo, "+14105550182");
    const { shareId, token } = r.json;

    r = await call(a.id, "POST", `/api/deals/${deal.id}/share`, { email: "marcus@capitalpartners.com" });
    assert.deepEqual([r.status, r.json.error], [409, SHARE_ERRORS.duplicate]);
    r = await call(b.id, "POST", `/api/deals/${deal.id}/share`, { email: "x@y.com" });
    assert.deepEqual([r.status, r.json.error], [404, SHARE_ERRORS.cantShare]);

    r = await call(b.id, "GET", "/api/shares/inbox/count");
    assert.deepEqual(r.json, { count: 1 });
    r = await call(b.id, "GET", "/api/shares/inbox");
    assert.equal(r.json[0].sender.name, "Jordan Rivera");
    assert.equal(r.json[0].note, "Comps are tight.");
    r = await call(a.id, "GET", "/api/shares/sent");
    assert.equal(r.json[0].texted, true);
    assert.equal(r.json[0].displayStatus, "PENDING");

    r = await call(a.id, "GET", `/api/shares/by-token/${token}`);
    assert.deepEqual(r.json, { shareId, state: "other-account", maskedEmail: "m•••@capitalpartners.com" });
    r = await call(b.id, "GET", `/api/shares/by-token/${token}`);
    assert.deepEqual(r.json, { shareId, state: "mine" });

    r = await call(a.id, "POST", `/api/shares/${shareId}/accept`);
    assert.equal(r.status, 403);
    r = await call(b.id, "POST", `/api/shares/${shareId}/accept`);
    assert.equal(r.status, 200);
    assert.ok(Number.isInteger(r.json.dealId));
    r = await call(b.id, "POST", `/api/shares/${shareId}/decline`);
    assert.deepEqual([r.status, r.json.error], [409, SHARE_ERRORS.unavailable]);

    r = await call(b.id, "GET", `/s/${token}`);
    assert.equal(r.status, 302);
    assert.equal(r.location, `/#/s/${token}`);
    console.log("PASS  share routes: status codes, payload shapes, /s/:token redirect");
  } catch (e) {
    failed = 1;
    console.log("FAIL  share routes\n", e);
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
  process.exit(failed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx server/scripts/testDealShareRoutes.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... server/dealShareRoutes`

- [ ] **Step 3: Implement the routes**

`server/dealShareRoutes.ts` (full file):

```ts
// v1.8.0 Deal Sharing — HTTP routes. Thin wrappers over ./dealShares; all
// business rules and guards live there (and are covered by
// server/scripts/testDealShares.ts).
import type { Express, Response } from "express";
import { requireAuth } from "./auth";
import {
  acceptShare,
  createShare,
  declineShare,
  inboxCount,
  listInbox,
  listSent,
  resolveShareToken,
  type ShareResult,
} from "./dealShares";

function send<T>(res: Response, r: ShareResult<T>, okStatus = 200) {
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  return res.status(okStatus).json(r.value);
}

const uid = (req: unknown) => (req as { userId: number }).userId;

export function registerDealShareRoutes(app: Express) {
  // Public share link. The SPA uses hash routing, so hand off to /#/s/:token;
  // ShareLinkPage resolves the state (and the auth gate stashes the token
  // across Google sign-in).
  app.get("/s/:token", (req, res) => {
    const token = String(req.params.token ?? "").replace(/[^A-Za-z0-9_-]/g, "");
    res.redirect(302, `/#/s/${token}`);
  });

  app.post("/api/deals/:id/share", requireAuth, async (req, res) => {
    send(res, await createShare(uid(req), Number(req.params.id), req.body ?? {}), 201);
  });

  app.get("/api/shares/inbox", requireAuth, async (req, res) => {
    res.json(await listInbox(uid(req)));
  });

  app.get("/api/shares/inbox/count", requireAuth, async (req, res) => {
    res.json({ count: await inboxCount(uid(req)) });
  });

  app.get("/api/shares/sent", requireAuth, async (req, res) => {
    res.json(await listSent(uid(req)));
  });

  app.post("/api/shares/:id/accept", requireAuth, async (req, res) => {
    send(res, await acceptShare(uid(req), Number(req.params.id)));
  });

  app.post("/api/shares/:id/decline", requireAuth, async (req, res) => {
    send(res, await declineShare(uid(req), Number(req.params.id)));
  });

  app.get("/api/shares/by-token/:token", requireAuth, async (req, res) => {
    res.json(await resolveShareToken(uid(req), String(req.params.token)));
  });
}
```

- [ ] **Step 4: Wire into `server/routes.ts`**

`server/routes.ts` (exact diff against main):

```diff
diff --git a/server/routes.ts b/server/routes.ts
index 856f331..5e8abf5 100644
--- a/server/routes.ts
+++ b/server/routes.ts
@@ -47,6 +47,8 @@ import {
   compTier,
 } from "@shared/propAttributes";
 import { MD_GIS_SCOPE } from "./siteGis";
+import { registerDealShareRoutes } from "./dealShareRoutes";
+import { withReceivedFromNames } from "./dealShares";
 import {
   runWelcomeDrip,
   sendDripBatch,
@@ -122,6 +124,9 @@ export async function registerRoutes(
   // Body parser is registered in server/index.ts. Trust the proxy so Secure cookies work.
   app.set("trust proxy", 1);
 
+  // v1.8.0 Deal Sharing: /s/:token + /api/deals/:id/share + /api/shares/*.
+  registerDealShareRoutes(app);
+
   // ----- Auth: request magic link -----
   //
   // App Store reviewer shortcut: if the email matches APP_REVIEWER_EMAIL
@@ -1783,7 +1788,8 @@ export async function registerRoutes(
   // ----- Deals CRUD (auth-required, scoped to current user) -----
   app.get("/api/deals", requireAuth, async (req, res) => {
     const userId = (req as any).userId as number;
-    res.json(await storage.listDeals(userId));
+    // v1.8.0: accepted shared copies carry a "From {name}" tag.
+    res.json(await withReceivedFromNames(await storage.listDeals(userId)));
   });
 
   app.get("/api/deals/:id", requireAuth, async (req, res) => {
@@ -1930,6 +1936,12 @@ export async function registerRoutes(
         dealId: r.dealId,
         isOriginal: r.isOriginal,
         createdAt: r.createdAt,
+        // v1.8.0: optional display label stored alongside the payload (e.g.
+        // "Received from Jordan Rivera" on an accepted shared deal).
+        label:
+          payload && typeof (payload as { label?: unknown }).label === "string"
+            ? ((payload as { label?: string }).label as string)
+            : null,
         changeSummary: r.changeSummary ? JSON.parse(r.changeSummary) : null,
         preview: payload
           ? {
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx tsx server/scripts/testDealShareRoutes.ts && npx tsx server/scripts/testDealShares.ts && npm run check`
Expected: `PASS  share routes: ...`, `6 passed, 0 failed`, `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/dealShareRoutes.ts server/routes.ts server/scripts/testDealShareRoutes.ts
git commit -m "feat(shares): share API routes, /s/:token redirect, From-name + snapshot label"
```

---

### Task 4: Client helpers (SMS handoff, share utilities)

**Files:**
- Create: `client/src/lib/sms.ts`, `client/src/lib/shares.ts`
- Test: `client/src/lib/shares.test.ts`

**Interfaces:**
- Consumes: `queryClient` from `client/src/lib/queryClient.ts`.
- Produces: `buildSmsUri(e164, body)`, `copyText(text)`, `openSmsWithFallback(e164, body, onFallback(copied), timeoutMs=1500)`; `SHARES_INBOX_KEY`, `SHARES_COUNT_KEY`, `SHARES_SENT_KEY`, `PENDING_SHARE_KEY`, `HIGHLIGHT_SHARE_KEY`, `invalidateShares()`, `shareErrorMessage(err, fallback?)`, `relativeTime(ms, now?)`, `truncateEmail(email)`, `capturePendingShareFromHash()`, `takePendingShare()`, `rememberPendingShare(token)`.

- [ ] **Step 1: Write the failing test**

`client/src/lib/shares.test.ts` (full file):

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { relativeTime, shareErrorMessage, truncateEmail } from "./shares";
import { buildSmsUri } from "./sms";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("relativeTime matches the mockup wording", () => {
  const now = new Date("2026-10-21T17:00:00Z").getTime();
  assert.equal(relativeTime(now - 20_000, now), "Just now");
  assert.equal(relativeTime(now - 12 * MIN, now), "12 min ago");
  assert.equal(relativeTime(now - 2 * HOUR, now), "2h ago");
  assert.equal(relativeTime(now - 30 * HOUR, now), "Yesterday");
  assert.equal(relativeTime(now - 3 * DAY, now), "3d ago");
  assert.equal(relativeTime(new Date("2026-10-12T17:00:00Z").getTime(), now), "Oct 12");
});

test("shareErrorMessage unwraps apiRequest errors", () => {
  assert.equal(
    shareErrorMessage(new Error('409: {"error":"Already sent to this person — waiting on their response."}')),
    "Already sent to this person — waiting on their response.",
  );
  assert.equal(shareErrorMessage(new Error("500: Internal Server Error")), "Something went wrong. Try again.");
  assert.equal(shareErrorMessage(new Error("403: {}"), "You can't share this deal."), "You can't share this deal.");
});

test("truncateEmail for toasts", () => {
  assert.equal(truncateEmail("marcus@capitalpartners.com"), "marcus@…");
});

test("buildSmsUri uses the iOS+Android-safe ?&body= form", () => {
  assert.equal(buildSmsUri("+14105550182", "Hi there\nhttps://x.co/s/a"), "sms:+14105550182?&body=Hi%20there%0Ahttps%3A%2F%2Fx.co%2Fs%2Fa");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --test client/src/lib/shares.test.ts`
Expected: FAIL — `ERR_MODULE_NOT_FOUND ... client/src/lib/shares`

- [ ] **Step 3: Implement `sms.ts`**

`client/src/lib/sms.ts` (full file):

```ts
// v1.8.0 Deal Sharing — SMS handoff. PropBoxIQ never sends texts: we open the
// phone's own Messages app with a pre-written body via an `sms:` URI and the
// sender taps send. The phone number is never stored server-side.

/** `sms:+1XXXXXXXXXX?&body=…` — the `?&` form works on both iOS and Android. */
export function buildSmsUri(e164: string, body: string): string {
  return `sms:${e164}?&body=${encodeURIComponent(body)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Open Messages. If the page never loses focus/visibility within `timeoutMs`
 * (desktop browser, no SMS handler), copy the text and call `onFallback` so
 * the UI can toast "Text copied — paste into Messages."
 */
export function openSmsWithFallback(
  e164: string,
  body: string,
  onFallback: (copied: boolean) => void,
  timeoutMs = 1500,
): void {
  let left = false;
  const mark = () => {
    left = true;
  };
  const onVis = () => {
    if (document.visibilityState === "hidden") left = true;
  };
  window.addEventListener("blur", mark);
  window.addEventListener("pagehide", mark);
  document.addEventListener("visibilitychange", onVis);
  try {
    window.location.href = buildSmsUri(e164, body);
  } catch {
    /* no handler — fallback below */
  }
  window.setTimeout(async () => {
    window.removeEventListener("blur", mark);
    window.removeEventListener("pagehide", mark);
    document.removeEventListener("visibilitychange", onVis);
    if (!left) onFallback(await copyText(body));
  }, timeoutMs);
}
```

- [ ] **Step 4: Implement `shares.ts`**

`client/src/lib/shares.ts` (full file):

```ts
// v1.8.0 Deal Sharing — client helpers: query keys, error unwrapping, time
// formatting, and the pending-share token that survives Google sign-in.
import { queryClient } from "./queryClient";

export const SHARES_INBOX_KEY = ["/api/shares/inbox"] as const;
export const SHARES_COUNT_KEY = ["/api/shares/inbox/count"] as const;
export const SHARES_SENT_KEY = ["/api/shares/sent"] as const;

export const PENDING_SHARE_KEY = "pbq_pending_share";
export const HIGHLIGHT_SHARE_KEY = "pbq_highlight_share";

export function invalidateShares(): void {
  queryClient.invalidateQueries({ queryKey: SHARES_INBOX_KEY });
  queryClient.invalidateQueries({ queryKey: SHARES_COUNT_KEY });
  queryClient.invalidateQueries({ queryKey: SHARES_SENT_KEY });
}

/** apiRequest throws `Error("409: {\"error\":\"…\"}")` — return the server's message. */
export function shareErrorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const i = msg.indexOf(": ");
  const body = i >= 0 ? msg.slice(i + 2) : msg;
  try {
    const j = JSON.parse(body);
    if (j && typeof j.error === "string" && j.error) return j.error;
  } catch {
    /* not JSON */
  }
  return fallback;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Just now" · "12 min ago" · "2h ago" · "Yesterday" · "3d ago" · "Oct 12" */
export function relativeTime(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms);
  const min = Math.floor(d / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return "Yesterday";
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  const dt = new Date(ms);
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

/** "marcus@capitalpartners.com" → "marcus@…" (toast copy). */
export function truncateEmail(email: string): string {
  const local = String(email ?? "").split("@")[0] ?? "";
  return `${local}@…`;
}

const TOKEN_RE = /^#\/s\/([A-Za-z0-9_-]{4,64})/;

/** Called by the auth gate while signed out: remember a /#/s/:token link. */
export function capturePendingShareFromHash(): void {
  try {
    const m = TOKEN_RE.exec(window.location.hash);
    if (m) localStorage.setItem(PENDING_SHARE_KEY, m[1]);
  } catch {
    /* storage unavailable */
  }
}

/** Called once signed in: returns and clears the remembered token. */
export function takePendingShare(): string | null {
  try {
    const t = localStorage.getItem(PENDING_SHARE_KEY);
    if (t) localStorage.removeItem(PENDING_SHARE_KEY);
    return t;
  } catch {
    return null;
  }
}

export function rememberPendingShare(token: string): void {
  try {
    localStorage.setItem(PENDING_SHARE_KEY, token);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test client/src/lib/shares.test.ts`
Expected: `# pass 4`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/sms.ts client/src/lib/shares.ts client/src/lib/shares.test.ts
git commit -m "feat(shares): client helpers for SMS handoff, errors, relative time, pending token"
```

---

### Task 5: Send sheet + entry points

There is no component-test harness in this repo; the gate for UI tasks is `npm run check` plus a 390px Playwright render compared against `deal-share-mocks.png` screen 1.

**Files:**
- Create: `client/src/components/share/SendDealSheet.tsx`
- Modify: `client/src/pages/Deal.tsx`, `client/src/pages/QuickResult.tsx`

**Interfaces:**
- Consumes: Task 1 helpers/types; Task 4 `invalidateShares`, `shareErrorMessage`, `truncateEmail`, `openSmsWithFallback`; `POST /api/deals/:id/share`.
- Produces: `<SendDealSheet dealId={number} open={boolean} onOpenChange={(open) => void} />`.

- [ ] **Step 1: Implement the sheet**

`client/src/components/share/SendDealSheet.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — "Send deal" bottom sheet (mockup screen 1).
// Email required, mobile optional (opens Messages via sms: — never stored),
// note ≤ 280. On success: toast, refresh Sent, and hand off to SMS if a
// number was entered.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateShares, shareErrorMessage, truncateEmail } from "@/lib/shares";
import { openSmsWithFallback } from "@/lib/sms";
import {
  SHARE_ERRORS,
  SHARE_NOTE_MAX,
  formatUsPhone,
  isValidShareEmail,
  normalizeShareEmail,
  normalizeUsPhone,
  type CreateShareResponse,
} from "@shared/dealShares";

const INCLUDED = ["Deal inputs", "ARV + comps", "Sources & Uses", "Walkthrough Budget", "Comp Hero"];

function FieldLabel({ label, hint, hintClass }: { label: string; hint: string; hintClass?: string }) {
  return (
    <div className="mt-3.5 mb-1.5 flex justify-between text-[12px] font-semibold text-muted-foreground">
      <span>{label}</span>
      <span className={hintClass ?? "font-medium text-muted-foreground/60"}>{hint}</span>
    </div>
  );
}

const fieldClass =
  "h-12 rounded-xl border-border bg-background px-3.5 text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#5fd4e7] focus-visible:shadow-[0_0_0_3px_rgba(95,212,231,0.12)]";

export function SendDealSheet({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setPhone("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const send = useMutation({
    mutationFn: async (): Promise<CreateShareResponse> => {
      const res = await apiRequest("POST", `/api/deals/${dealId}/share`, {
        email: normalizeShareEmail(email),
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (r) => {
      const to = truncateEmail(normalizeShareEmail(email));
      invalidateShares();
      onOpenChange(false);
      if (r.inviteEmailFailed) {
        toast({ title: "Deal saved, but the invite email failed — share the link by text instead." });
      } else {
        toast({ title: r.displayStatus === "INVITED" ? `Invite emailed to ${to}` : `Sent to ${to}` });
      }
      if (r.smsTo && r.smsBody) {
        openSmsWithFallback(r.smsTo, r.smsBody, (copied) => {
          if (copied) toast({ title: "Text copied — paste into Messages." });
        });
      }
    },
    onError: (e) => setError(shareErrorMessage(e)),
  });

  const noteLen = note.length;
  const noteOver = noteLen > SHARE_NOTE_MAX;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidShareEmail(normalizeShareEmail(email))) return setError(SHARE_ERRORS.invalidEmail);
    if (phone.trim() && !normalizeUsPhone(phone)) return setError(SHARE_ERRORS.phone);
    if (noteOver) return setError(SHARE_ERRORS.note);
    send.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] border-t border-border bg-card px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] [&>button]:right-5 [&>button]:top-[34px]"
        data-testid="sheet-send-deal"
      >
        <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        <SheetHeader className="space-y-0.5 text-left">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.01em]">Send deal</SheetTitle>
          <SheetDescription className="text-[12px]">
            They'll get their own copy to edit. Your deal stays unchanged.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} noValidate>
          <FieldLabel label="Email" hint="required" />
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            data-testid="input-share-email"
          />

          <FieldLabel label="Mobile number" hint="optional" />
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(410) 555-0182"
            value={phone}
            onChange={(e) => setPhone(formatUsPhone(e.target.value))}
            className={fieldClass}
            data-testid="input-share-phone"
          />
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground/80">
            Adding a number opens your Messages app with a pre-written text and link.
          </p>

          <FieldLabel
            label="Note"
            hint={`${noteLen} / ${SHARE_NOTE_MAX}`}
            hintClass={noteOver ? "font-semibold text-[#e56666]" : undefined}
          />
          <Textarea
            rows={2}
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${fieldClass} h-auto min-h-[62px] resize-none py-3 leading-snug`}
            data-testid="input-share-note"
          />

          <div className="mt-3.5 text-[12px] font-semibold text-muted-foreground">Included</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INCLUDED.map((x) => (
              <span
                key={x}
                className="rounded-lg border border-border bg-background px-2 py-[5px] text-[11.5px] text-foreground/80"
              >
                <span className="font-bold text-[#7fd4a8]">✓ </span>
                {x}
              </span>
            ))}
          </div>

          {error && (
            <p className="mt-3 text-[12.5px] font-medium text-[#e56666]" role="alert" data-testid="text-share-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={send.isPending || noteOver}
            className="mt-[18px] h-[50px] w-full rounded-xl bg-[#5fd4e7] text-[15px] font-bold text-[#0a0e12] hover:bg-[#7be3f0]"
            data-testid="button-send-deal-submit"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send deal"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Entry points on `Deal.tsx` (header send icon + `···` menu item)**

`client/src/pages/Deal.tsx` (exact diff against main):

```diff
diff --git a/client/src/pages/Deal.tsx b/client/src/pages/Deal.tsx
index 2e295f5..1a0a7cd 100644
--- a/client/src/pages/Deal.tsx
+++ b/client/src/pages/Deal.tsx
@@ -48,7 +48,9 @@ import {
   GitCompare,
   Trash2,
   Trophy,
+  Send,
 } from "lucide-react";
+import { SendDealSheet } from "@/components/share/SendDealSheet";
 
 export default function DealPage() {
   const { id } = useParams<{ id: string }>();
@@ -71,6 +73,7 @@ export default function DealPage() {
   }>({});
   const [dirty, setDirty] = useState(false);
   const [emailOpen, setEmailOpen] = useState(false);
+  const [sendOpen, setSendOpen] = useState(false); // v1.8.0 Deal Sharing
   const [budgetOpen, setBudgetOpen] = useState(false);
 
   // Hydrate from server
@@ -226,6 +229,18 @@ export default function DealPage() {
             <Save className="h-4 w-4 mr-2" />
             {saveMut.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
           </Button>
+          <Button
+            variant="outline"
+            size="icon"
+            aria-label="Send deal"
+            onClick={() => {
+              if (dirty && !window.confirm("You have unsaved changes. Send the last saved version?")) return;
+              setSendOpen(true);
+            }}
+            data-testid="button-send-deal-header"
+          >
+            <Send className="h-4 w-4" />
+          </Button>
           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="outline" size="icon" aria-label="More actions" data-testid="button-more-menu">
@@ -251,6 +266,15 @@ export default function DealPage() {
               <DropdownMenuItem onClick={() => exportDealPdf(deal, inputs)} data-testid="menu-export-pdf">
                 <Download className="h-4 w-4 mr-2" /> Export PDF
               </DropdownMenuItem>
+              <DropdownMenuItem
+                onClick={() => {
+                  if (dirty && !window.confirm("You have unsaved changes. Send the last saved version?")) return;
+                  setSendOpen(true);
+                }}
+                data-testid="menu-send-deal"
+              >
+                <Send className="h-4 w-4 mr-2" /> Send deal
+              </DropdownMenuItem>
               <DropdownMenuItem onClick={() => setEmailOpen(true)} data-testid="menu-email-pdf">
                 <Mail className="h-4 w-4 mr-2" /> Email
               </DropdownMenuItem>
@@ -626,6 +650,7 @@ export default function DealPage() {
         }}
       />
 
+      <SendDealSheet dealId={deal.id} open={sendOpen} onOpenChange={setSendOpen} />
       <EmailPdfDialog
         open={emailOpen}
         onOpenChange={setEmailOpen}
```

- [ ] **Step 3: Entry points on `QuickResult.tsx`**

`client/src/pages/QuickResult.tsx` (exact diff against main):

```diff
diff --git a/client/src/pages/QuickResult.tsx b/client/src/pages/QuickResult.tsx
index db65b8f..30c0cdc 100644
--- a/client/src/pages/QuickResult.tsx
+++ b/client/src/pages/QuickResult.tsx
@@ -47,7 +47,9 @@ import {
   Mail,
   ClipboardList,
   Trophy,
+  Send,
 } from "lucide-react";
+import { SendDealSheet } from "@/components/share/SendDealSheet";
 import {
   stylesMatch,
   combinedHvacLabel,
@@ -103,6 +105,12 @@ export default function QuickResult() {
   });
 
   const [emailOpen, setEmailOpen] = useState(false);
+  // v1.8.0 Deal Sharing
+  const [sendOpen, setSendOpen] = useState(false);
+  const openSend = () => {
+    if (sourcesUsesDirty && !window.confirm("You have unsaved Sources & Uses edits. Send the last saved version?")) return;
+    setSendOpen(true);
+  };
   const [budgetOpen, setBudgetOpen] = useState(false);
   // Set while the Sources & Uses card holds uncommitted edits, so the Home
   // button (a plain navigate(), not an anchor) can confirm before leaving.
@@ -143,12 +151,18 @@ export default function QuickResult() {
           <ArrowLeft className="h-4 w-4 mr-1.5" />
           Home
         </Button>
-        <Link href="/quick">
-          <Button variant="outline" size="sm" data-testid="button-new-deal">
-            <RotateCcw className="h-4 w-4 mr-1.5" />
-            Analyze another
+        <div className="flex items-center gap-2">
+          <Button variant="outline" size="sm" onClick={openSend} data-testid="button-send-deal">
+            <Send className="h-4 w-4 mr-1.5" />
+            Send
           </Button>
-        </Link>
+          <Link href="/quick">
+            <Button variant="outline" size="sm" data-testid="button-new-deal">
+              <RotateCcw className="h-4 w-4 mr-1.5" />
+              Analyze another
+            </Button>
+          </Link>
+        </div>
       </div>
 
       {/* Address card */}
@@ -543,8 +557,14 @@ export default function QuickResult() {
           <Mail className="h-4 w-4 mr-2" />
           Email
         </Button>
+        <Button variant="outline" size="sm" onClick={openSend} data-testid="button-send-deal-bottom">
+          <Send className="h-4 w-4 mr-2" />
+          Send deal
+        </Button>
       </div>
 
+      <SendDealSheet dealId={deal.id} open={sendOpen} onOpenChange={setSendOpen} />
+
       <WalkthroughBudget
         deal={deal}
         open={budgetOpen}
```

- [ ] **Step 4: Typecheck + render**

Run: `npm run check` → exits 0. Render `/#/result/:id` at 390×844, tap **Send**, fill email + note; compare with mock screen 1 (grabber, title + ✕, Email "required", Mobile "optional" + hint, Note counter, Included chips with green ✓, full-width cyan Send deal).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/share/SendDealSheet.tsx client/src/pages/Deal.tsx client/src/pages/QuickResult.tsx
git commit -m "feat(shares): Send deal bottom sheet + entry points on Deal and QuickResult"
```

---

### Task 6: Shared deals page, tray badge, share link landing, From tag

**Files:**
- Create: `client/src/components/share/SharePill.tsx`, `SharedDealCard.tsx`, `SentShareRow.tsx`, `InboxTrayButton.tsx`
- Create: `client/src/pages/SharedDealsPage.tsx`, `client/src/pages/ShareLinkPage.tsx`
- Modify: `client/src/App.tsx`, `client/src/components/AppShell.tsx`, `client/src/pages/Deals.tsx`, `client/src/components/SnapshotHistory.tsx`

**Interfaces:**
- Consumes: Task 3 endpoints, Task 4 helpers, `useAuth()` (`user`, `signOut`), `runningInApp()` from `client/src/lib/native.ts`.
- Produces: routes `/shared` and `/s/:token`; `<InboxTrayButton/>`; `SharedDealCard({share, highlighted?, busy?, onAccept, onDecline})`; `SentShareRow({share, last?})`; `SharePill({status})`.

- [ ] **Step 1: Status pill**

`client/src/components/share/SharePill.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — status pill (mockup: NEW / PENDING / INVITED / ACCEPTED / DECLINED).
import type { ShareDisplayStatus } from "@shared/dealShares";

const TONES: Record<ShareDisplayStatus | "NEW", { bg: string; fg: string }> = {
  NEW: { bg: "rgba(245,201,72,0.14)", fg: "#f5c948" },
  PENDING: { bg: "rgba(245,201,72,0.14)", fg: "#f5c948" },
  INVITED: { bg: "rgba(95,212,231,0.14)", fg: "#5fd4e7" },
  ACCEPTED: { bg: "rgba(127,212,168,0.14)", fg: "#7fd4a8" },
  DECLINED: { bg: "rgba(229,102,102,0.14)", fg: "#e56666" },
  EXPIRED: { bg: "rgba(138,154,166,0.14)", fg: "#8a9aa6" },
};

export function SharePill({ status }: { status: ShareDisplayStatus | "NEW" }) {
  const t = TONES[status];
  return (
    <span
      className="shrink-0 rounded-full px-[9px] py-1 text-[11px] font-bold tracking-[0.03em]"
      style={{ background: t.bg, color: t.fg }}
      data-testid={`pill-${status.toLowerCase()}`}
    >
      {status}
    </span>
  );
}
```

- [ ] **Step 2: Inbox card**

`client/src/components/share/SharedDealCard.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — inbox card (mockup screen 3).
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtShortUsd, initialsOf, type InboxShare } from "@shared/dealShares";
import { relativeTime } from "@/lib/shares";
import { SharePill } from "./SharePill";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-[10px] border border-border/70 bg-background px-2.5 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <b className="mt-0.5 block text-[16px] font-bold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </b>
    </div>
  );
}

export function metaLine(s: InboxShare["summary"]): string {
  const place = [s.city, s.state].filter(Boolean).join(", ");
  return [place, s.sqft ? `${s.sqft.toLocaleString("en-US")} SF` : null, s.style].filter(Boolean).join(" · ");
}

export function SharedDealCard({
  share,
  highlighted,
  busy,
  onAccept,
  onDecline,
}: {
  share: InboxShare;
  highlighted?: boolean;
  busy?: "accept" | "decline" | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const s = share.summary;
  const profitTone = s.profit >= 0 ? "#7fd4a8" : "#e56666";
  return (
    <div
      id={`share-${share.id}`}
      className={`rounded-2xl border bg-card px-4 py-[15px] transition-shadow ${
        highlighted ? "border-[#5fd4e7]/60 shadow-[0_0_0_3px_rgba(95,212,231,0.12)]" : "border-card-border"
      }`}
      data-testid={`card-share-${share.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[9px]">
          <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#126D85] text-[12px] font-bold text-white">
            {initialsOf(share.sender.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">{share.sender.name}</div>
            <div className="text-[12px] text-muted-foreground">{relativeTime(share.createdAt)}</div>
          </div>
        </div>
        <SharePill status="NEW" />
      </div>

      <div className="mt-3 text-[16px] font-bold tracking-[-0.01em]">{s.street}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{metaLine(s)}</div>

      <div className="mt-3 flex gap-2">
        <Kpi label="ARV" value={fmtShortUsd(s.arv)} />
        <Kpi label="Profit" value={fmtShortUsd(s.profit)} tone={profitTone} />
        <Kpi label="Price" value={fmtShortUsd(s.price)} />
      </div>

      {share.note && (
        <div className="mt-[11px] whitespace-pre-wrap rounded-r-lg border-l-2 border-[#5fd4e7] bg-background/70 px-2.5 py-2 text-[13px] leading-snug text-foreground/85">
          {share.note}
        </div>
      )}

      <div className="mt-[13px] flex gap-[9px]">
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={onDecline}
          className="h-[46px] flex-1 rounded-xl bg-transparent text-[14px] font-bold"
          data-testid={`button-decline-${share.id}`}
        >
          {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decline"}
        </Button>
        <Button
          disabled={!!busy}
          onClick={onAccept}
          className="h-[46px] flex-1 rounded-xl bg-[#5fd4e7] text-[14px] font-bold text-[#0a0e12] hover:bg-[#7be3f0]"
          data-testid={`button-accept-${share.id}`}
        >
          {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept & copy"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Sent row**

`client/src/components/share/SentShareRow.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — one row in the Sent tab (mockup screen 4).
import type { SentShare } from "@shared/dealShares";
import { relativeTime } from "@/lib/shares";
import { SharePill } from "./SharePill";

export function sentMetaLine(s: SentShare, now = Date.now()): string {
  const when = relativeTime(s.respondedAt ?? s.createdAt, now);
  const parts = [`To ${s.recipientEmail}`];
  if (s.displayStatus === "INVITED") parts.push("no account yet", "invite emailed");
  if (s.displayStatus === "EXPIRED") parts.push("invite expired");
  if (s.texted) parts.push("texted");
  // Mid-sentence casing: "yesterday", "just now"; dates stay "Oct 12".
  parts.push(when === "Yesterday" || when === "Just now" ? when.toLowerCase() : when);
  return parts.join(" · ");
}

export function SentShareRow({ share, last }: { share: SentShare; last?: boolean }) {
  return (
    <div className={`py-[13px] ${last ? "" : "border-b border-border/60"}`} data-testid={`row-sent-${share.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[15px] font-bold tracking-[-0.01em]">{share.summary.street}</div>
        <SharePill status={share.displayStatus} />
      </div>
      <div className="mt-[3px] text-[12px] text-muted-foreground">{sentMetaLine(share)}</div>
      {share.displayStatus === "INVITED" && share.expiresInDays != null && (
        <div className="mt-[3px] text-[12px] text-muted-foreground/60">
          Invite expires in {share.expiresInDays} {share.expiresInDays === 1 ? "day" : "days"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Header tray with badge (60s poll while visible + refetch on focus)**

`client/src/components/share/InboxTrayButton.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — header tray icon with gold count badge. Polls every
// 60s while the app is visible and refetches on focus/resume.
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SHARES_COUNT_KEY } from "@/lib/shares";

export function InboxTrayButton() {
  const [location] = useLocation();
  const active = location.startsWith("/shared");
  const { data } = useQuery<{ count: number }>({
    queryKey: SHARES_COUNT_KEY,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const count = data?.count ?? 0;
  return (
    <Link href="/shared">
      <Button
        variant={active ? "secondary" : "ghost"}
        size="icon"
        className={`relative ${count > 0 ? "text-[#5fd4e7]" : ""}`}
        aria-label={count > 0 ? `Shared deals, ${count} new` : "Shared deals"}
        data-testid="button-shared-inbox"
      >
        <Inbox className="h-4 w-4" />
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold ring-2 ring-background"
            style={{ background: "#f5c948", color: "#0a0e12" }}
            data-testid="badge-inbox-count"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
    </Link>
  );
}
```

- [ ] **Step 5: Shared deals page (decline confirmation is a bottom sheet)**

`client/src/pages/SharedDealsPage.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — "Shared deals" page: Inbox (received, pending) and
// Sent (status per share). Mockup screens 3 + 4.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Inbox as InboxIcon, Send } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  HIGHLIGHT_SHARE_KEY,
  SHARES_INBOX_KEY,
  SHARES_SENT_KEY,
  invalidateShares,
  shareErrorMessage,
} from "@/lib/shares";
import { SharedDealCard } from "@/components/share/SharedDealCard";
import { SentShareRow } from "@/components/share/SentShareRow";
import { displayNameOf, type InboxShare, type SentShare } from "@shared/dealShares";

type Tab = "inbox" | "sent";

function takeHighlight(): number | null {
  try {
    const v = sessionStorage.getItem(HIGHLIGHT_SHARE_KEY);
    if (v) sessionStorage.removeItem(HIGHLIGHT_SHARE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="text-[15px] font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-[280px] text-[13px] text-muted-foreground">{body}</p>
    </div>
  );
}

export default function SharedDealsPage({ initialTab = "inbox" }: { initialTab?: Tab }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [highlightId] = useState<number | null>(() => takeHighlight());
  const [confirmDecline, setConfirmDecline] = useState<InboxShare | null>(null);
  const [busy, setBusy] = useState<{ id: number; kind: "accept" | "decline" } | null>(null);

  const inbox = useQuery<InboxShare[]>({ queryKey: SHARES_INBOX_KEY, refetchOnWindowFocus: true });
  const sent = useQuery<SentShare[]>({ queryKey: SHARES_SENT_KEY, refetchOnWindowFocus: true });
  const inboxItems = inbox.data ?? [];
  const sentItems = sent.data ?? [];

  useEffect(() => {
    if (highlightId == null || !inbox.data) return;
    document.getElementById(`share-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, inbox.data]);

  const accept = useMutation({
    mutationFn: async (s: InboxShare) => (await apiRequest("POST", `/api/shares/${s.id}/accept`)).json() as Promise<{ dealId: number }>,
    onMutate: (s) => setBusy({ id: s.id, kind: "accept" }),
    onSuccess: ({ dealId }) => {
      invalidateShares();
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal added to your list." });
      navigate(`/deal/${dealId}`);
    },
    onError: (e) => {
      invalidateShares();
      toast({ title: shareErrorMessage(e), variant: "destructive" });
    },
    onSettled: () => setBusy(null),
  });

  const decline = useMutation({
    mutationFn: async (s: InboxShare) => (await apiRequest("POST", `/api/shares/${s.id}/decline`)).json(),
    onMutate: (s) => setBusy({ id: s.id, kind: "decline" }),
    onSuccess: () => {
      invalidateShares();
      toast({ title: "Deal declined" });
    },
    onError: (e) => {
      invalidateShares();
      toast({ title: shareErrorMessage(e), variant: "destructive" });
    },
    onSettled: () => setBusy(null),
  });

  const latestAccepted = useMemo(() => sentItems.find((s) => s.displayStatus === "ACCEPTED"), [sentItems]);
  const myName = user ? displayNameOf(user.name, user.email) : "you";

  const tabLabel = (t: Tab) => {
    const n = t === "inbox" ? inboxItems.length : sentItems.length;
    const base = t === "inbox" ? "Inbox" : "Sent";
    return n > 0 ? `${base} · ${n}` : base;
  };

  return (
    <div className="mx-auto max-w-md pb-[calc(2rem+env(safe-area-inset-bottom,0px))]" data-testid="page-shared-deals">
      <div className="px-5 pb-3.5 pt-1">
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">Shared deals</h1>
      </div>

      <div className="mx-5 mb-4 flex rounded-xl border border-border bg-card p-1" role="tablist">
        {(["inbox", "sent"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-[9px] py-[9px] text-[14px] font-semibold transition-colors ${
              tab === t ? "bg-[#126D85] text-white" : "text-muted-foreground"
            }`}
            data-testid={`tab-${t}`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {tab === "inbox" ? (
        <div className="space-y-3 px-5">
          {inbox.isLoading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
          ) : inboxItems.length === 0 ? (
            <Empty
              icon={<InboxIcon className="h-5 w-5" />}
              title="No shared deals yet"
              body="When someone sends you a deal, it shows up here for you to accept or decline."
            />
          ) : (
            inboxItems.map((s) => (
              <SharedDealCard
                key={s.id}
                share={s}
                highlighted={s.id === highlightId}
                busy={busy?.id === s.id ? busy.kind : null}
                onAccept={() => accept.mutate(s)}
                onDecline={() => setConfirmDecline(s)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="px-5">
          {sent.isLoading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
          ) : sentItems.length === 0 ? (
            <Empty
              icon={<Send className="h-5 w-5" />}
              title="Nothing sent yet"
              body="Open a Flip deal and tap Send deal to share your analysis."
            />
          ) : (
            <>
              <div>
                {sentItems.map((s, i) => (
                  <SentShareRow key={s.id} share={s} last={i === sentItems.length - 1} />
                ))}
              </div>
              {latestAccepted && (
                <div className="mt-3.5 rounded-2xl border border-card-border bg-card px-4 py-[15px]" data-testid="card-accepted-copy">
                  <div className="text-[12px] font-bold tracking-[0.1em] text-[#5fd4e7]">ACCEPTED COPY</div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {latestAccepted.recipientEmail} now owns their own version of {latestAccepted.summary.street}. Edits
                    on either side stay separate. Their copy starts with a "Received from {myName}" snapshot.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Sheet open={!!confirmDecline} onOpenChange={(o) => !o && setConfirmDecline(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-md rounded-t-[26px] border-t border-border bg-card px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] [&>button]:hidden"
          data-testid="sheet-decline-confirm"
        >
          <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-[19px] font-bold tracking-[-0.01em]">Decline this deal?</SheetTitle>
            <SheetDescription className="text-[13px]">The sender will see it was declined.</SheetDescription>
          </SheetHeader>
          <div className="mt-5 flex gap-[9px]">
            <Button
              variant="outline"
              onClick={() => setConfirmDecline(null)}
              className="h-[50px] flex-1 rounded-xl bg-transparent text-[15px] font-bold"
              data-testid="button-decline-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmDecline) decline.mutate(confirmDecline);
                setConfirmDecline(null);
              }}
              className="h-[50px] flex-1 rounded-xl bg-[#e56666] text-[15px] font-bold text-white hover:bg-[#e56666]/90"
              data-testid="button-decline-confirm"
            >
              Decline
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 6: Share link landing**

`client/src/pages/ShareLinkPage.tsx` (full file):

```tsx
// v1.8.0 Deal Sharing — /s/:token landing (server redirects /s/:token → /#/s/:token).
//   mine           → open Shared deals with that card highlighted
//   other-account  → "sent to m•••@domain" + Switch account (Google)
//   unavailable    → "no longer available"
// Signed-out visitors never reach this page: the auth gate stashes the token
// and AuthGate replays it after Google sign-in.
import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MailWarning, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { runningInApp } from "@/lib/native";
import { HIGHLIGHT_SHARE_KEY, rememberPendingShare } from "@/lib/shares";
import type { ShareTokenResolution } from "@shared/dealShares";

export function ShareLinkView({
  resolution,
  email,
  onSwitch,
  onHome,
}: {
  resolution: ShareTokenResolution;
  email: string;
  onSwitch: () => void;
  onHome: () => void;
}) {
  const other = resolution.state === "other-account";
  return (
    <div className="mx-auto max-w-md px-5 pt-6" data-testid={`share-link-${resolution.state}`}>
      <div className="rounded-2xl border border-card-border bg-card px-5 py-6 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: other ? "rgba(95,212,231,0.14)" : "rgba(138,154,166,0.14)", color: other ? "#5fd4e7" : "#8a9aa6" }}
        >
          {other ? <MailWarning className="h-6 w-6" /> : <PackageX className="h-6 w-6" />}
        </div>
        {other ? (
          <>
            <h1 className="text-[19px] font-bold tracking-[-0.01em]">This deal was sent to another account</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              This deal was sent to <span className="font-semibold text-foreground">{resolution.maskedEmail}</span>. Sign in
              with that Google account to view it.
            </p>
            <p className="mt-3 text-[12px] text-muted-foreground/70">
              You're signed in as <span className="font-medium">{email}</span>
            </p>
            <Button
              onClick={onSwitch}
              className="mt-5 h-[50px] w-full rounded-xl bg-[#5fd4e7] text-[15px] font-bold text-[#0a0e12] hover:bg-[#7be3f0]"
              data-testid="button-switch-account"
            >
              Switch account
            </Button>
            <Button variant="ghost" onClick={onHome} className="mt-2 h-11 w-full rounded-xl text-[14px]">
              Back to my deals
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-[19px] font-bold tracking-[-0.01em]">This shared deal is no longer available.</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              It may have been accepted, declined, or the invite expired. Ask the sender to send it again.
            </p>
            <Button onClick={onHome} variant="outline" className="mt-5 h-[50px] w-full rounded-xl text-[15px] font-bold">
              Go to my deals
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ShareLinkPage() {
  const [, params] = useRoute<{ token: string }>("/s/:token");
  const token = params?.token ?? "";
  const [, navigate] = useLocation();
  const { user, signOut } = useAuth();
  const q = useQuery<ShareTokenResolution>({ queryKey: [`/api/shares/by-token/${encodeURIComponent(token)}`], enabled: !!token });

  useEffect(() => {
    if (q.data?.state === "mine" && q.data.shareId != null) {
      try {
        sessionStorage.setItem(HIGHLIGHT_SHARE_KEY, String(q.data.shareId));
      } catch {
        /* ignore */
      }
      navigate("/shared", { replace: true });
    }
  }, [q.data, navigate]);

  if (q.isLoading || q.data?.state === "mine") {
    return (
      <div className="flex justify-center pt-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const resolution: ShareTokenResolution = q.data ?? { shareId: null, state: "unavailable" };
  return (
    <ShareLinkView
      resolution={resolution}
      email={user?.email ?? ""}
      onHome={() => navigate("/deals")}
      onSwitch={async () => {
        rememberPendingShare(token);
        await signOut();
        // Web: straight to Google's account chooser (prompt=select_account).
        // iOS app: Google is hidden on Login, so the gate shows the magic-link
        // form; the remembered token replays after either sign-in.
        if (!runningInApp()) window.location.href = "/api/auth/google";
      }}
    />
  );
}
```

- [ ] **Step 7: Routes + pending-token replay**

`client/src/App.tsx` (exact diff against main):

```diff
diff --git a/client/src/App.tsx b/client/src/App.tsx
index 1ac50c3..8dd12a4 100644
--- a/client/src/App.tsx
+++ b/client/src/App.tsx
@@ -1,4 +1,5 @@
-import { Switch, Route, Router } from "wouter";
+import { useEffect } from "react";
+import { Switch, Route, Router, useLocation } from "wouter";
 import { useHashLocation } from "wouter/use-hash-location";
 import { queryClient } from "./lib/queryClient";
 import { QueryClientProvider } from "@tanstack/react-query";
@@ -21,6 +22,9 @@ import CompHeroPage from "@/components/CompHero/CompHeroPage";
 import Deals from "@/pages/Deals";
 import Settings from "@/pages/Settings";
 import Login from "@/pages/Login";
+import SharedDealsPage from "@/pages/SharedDealsPage";
+import ShareLinkPage from "@/pages/ShareLinkPage";
+import { capturePendingShareFromHash, takePendingShare } from "@/lib/shares";
 import { Loader2 } from "lucide-react";
 
 function AppRouter() {
@@ -37,6 +41,8 @@ function AppRouter() {
       <Route path="/deal/:id" component={DealPage} />
       <Route path="/deals" component={Deals} />
       <Route path="/settings" component={Settings} />
+      <Route path="/shared"><SharedDealsPage /></Route>
+      <Route path="/s/:token" component={ShareLinkPage} />
       <Route component={NotFound} />
     </Switch>
   );
@@ -49,6 +55,19 @@ function AppRouter() {
  */
 function AuthGate() {
   const { user, isLoading } = useAuth();
+  const [, navigate] = useLocation();
+
+  // v1.8.0 Deal Sharing: a signed-out visitor on /#/s/:token signs in first
+  // (Google redirects back to "/"), so remember the token and replay it.
+  useEffect(() => {
+    if (isLoading) return;
+    if (!user) {
+      capturePendingShareFromHash();
+      return;
+    }
+    const pending = takePendingShare();
+    if (pending) navigate(`/s/${pending}`, { replace: true });
+  }, [user, isLoading, navigate]);
 
   if (isLoading) {
     return (
```

- [ ] **Step 8: Tray in the header (header markup/safe-area untouched)**

`client/src/components/AppShell.tsx` (exact diff against main):

```diff
diff --git a/client/src/components/AppShell.tsx b/client/src/components/AppShell.tsx
index 264f9f7..b7d499e 100644
--- a/client/src/components/AppShell.tsx
+++ b/client/src/components/AppShell.tsx
@@ -1,6 +1,7 @@
 import { Link, useLocation } from "wouter";
 import { Logo, Wordmark } from "./Logo";
 import { Button } from "@/components/ui/button";
+import { InboxTrayButton } from "@/components/share/InboxTrayButton";
 import {
   DropdownMenu,
   DropdownMenuContent,
@@ -73,6 +74,7 @@ export function AppShell({ children }: { children: React.ReactNode }) {
                 Deals
               </Button>
             </Link>
+            <InboxTrayButton />
             <Link href="/settings">
               <Button
                 variant={isSettings ? "secondary" : "ghost"}
```

- [ ] **Step 9: "From {name}" tag in the deal list**

`client/src/pages/Deals.tsx` (exact diff against main):

```diff
diff --git a/client/src/pages/Deals.tsx b/client/src/pages/Deals.tsx
index 5f34b8e..5c4609a 100644
--- a/client/src/pages/Deals.tsx
+++ b/client/src/pages/Deals.tsx
@@ -875,6 +875,15 @@ function DealRow({
             >
               {deal.name?.trim() || deal.address}
             </p>
+            {(deal as { receivedFromName?: string | null }).receivedFromName && (
+              <span
+                className="shrink-0 rounded px-1.5 py-[1px] text-[10px] font-semibold"
+                style={{ color: "#5fd4e7", background: "rgba(95,212,231,0.12)" }}
+                data-testid={`tag-received-from-${deal.id}`}
+              >
+                From {(deal as { receivedFromName?: string | null }).receivedFromName!.split(" ")[0]}
+              </span>
+            )}
           </div>
           <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
             {deal.city && deal.state ? `${deal.city}, ${deal.state}` : "Address pending"}
```

- [ ] **Step 10: Snapshot label (display only)**

`client/src/components/SnapshotHistory.tsx` (exact diff against main):

```diff
diff --git a/client/src/components/SnapshotHistory.tsx b/client/src/components/SnapshotHistory.tsx
index dd38188..6759a13 100644
--- a/client/src/components/SnapshotHistory.tsx
+++ b/client/src/components/SnapshotHistory.tsx
@@ -9,6 +9,8 @@ export interface SnapshotListItem {
   id: number;
   dealId: number;
   isOriginal: boolean;
+  /** v1.8.0: e.g. "Received from Jordan Rivera" on an accepted shared deal. */
+  label?: string | null;
   createdAt: number;
   changeSummary: ChangeSummary | null;
   preview: {
@@ -134,7 +136,7 @@ export function SnapshotHistory({ dealId }: { dealId: number }) {
                     )}
                     {s.isOriginal && (
                       <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
-                        Original
+                        {s.label || "Original"}
                       </span>
                     )}
                   </div>
```

- [ ] **Step 11: Typecheck + render**

Run: `npm run check` → exits 0. Render at 390px: `/#/shared` as recipient (mock screen 3), Sent tab as sender (mock screen 4), `/s/:token` as a third account (other-account state).

- [ ] **Step 12: Commit**

```bash
git add client/src/components/share client/src/pages/SharedDealsPage.tsx client/src/pages/ShareLinkPage.tsx client/src/App.tsx client/src/components/AppShell.tsx client/src/pages/Deals.tsx client/src/components/SnapshotHistory.tsx
git commit -m "feat(shares): Shared deals inbox/sent, tray badge, /s/:token landing, From tag"
```

---

### Task 7: Release v1.8.0 + full gates

**Files:**
- Modify: `package.json` (version + `test:shares` script), `package-lock.json` (root version ×2), `shared/version.ts`, `CHANGELOG.md`, `shared/releaseNotes.ts`

- [ ] **Step 1: Version + notes**

`package.json` (exact diff against main):

```diff
diff --git a/package.json b/package.json
index cd9200b..ae78ece 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "rest-express",
-  "version": "1.7.6",
+  "version": "1.8.0",
   "license": "MIT",
   "type": "module",
   "scripts": {
@@ -8,6 +8,7 @@
     "build": "tsx script/build.ts",
     "start": "NODE_ENV=production node dist/index.cjs",
     "check": "tsc",
+    "test:shares": "tsx server/scripts/testDealShares.ts && tsx server/scripts/testDealShareRoutes.ts && tsx --test shared/dealShares.test.ts client/src/lib/shares.test.ts",
     "test:memo": "tsx --test client/src/lib/lenderMemo.test.ts",
     "sample:memo": "tsx script/render-lender-memo-samples.ts",
     "db:push": "drizzle-kit push"
```

`package-lock.json` (exact diff against main):

```diff
diff --git a/package-lock.json b/package-lock.json
index 630fa56..15a1fe2 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,12 +1,12 @@
 {
   "name": "rest-express",
-  "version": "1.7.6",
+  "version": "1.8.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "rest-express",
-      "version": "1.7.6",
+      "version": "1.8.0",
       "license": "MIT",
       "dependencies": {
         "@capacitor/app": "^8.1.0",
```

`shared/version.ts` (exact diff against main):

```diff
diff --git a/shared/version.ts b/shared/version.ts
index 339945c..06aa8d7 100644
--- a/shared/version.ts
+++ b/shared/version.ts
@@ -1,7 +1,7 @@
 // Single source of truth for the app version. Kept in sync with the `version`
 // field in package.json. Imported by the client (Settings + footer) and anywhere
 // else that needs to display or compare the running app version.
-export const APP_VERSION = "1.7.6";
+export const APP_VERSION = "1.8.0";
 
 // Numeric semver compare. Returns <0 if a<b, 0 if equal, >0 if a>b. Tolerates
 // missing/partial versions (treats missing segments as 0) and ignores any
```

`CHANGELOG.md` (exact diff against main):

```diff
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 7cf2200..333c562 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -3,6 +3,13 @@
 All notable changes to PropBoxIQ are documented here. This project follows
 [semantic versioning](https://semver.org/).
 
+## [1.8.0] — 2026-10-21
+### Added
+- Send Flip deals to other users by email, with an optional pre-filled text from your phone
+- "Shared deals" inbox with Accept & copy / Decline, plus a badge in the header
+- Sent tab showing Pending, Invited, Accepted, Declined, and Expired status
+- Email invites for recipients without a PropBoxIQ account (30-day expiry)
+
 ## [1.7.6] — 2026-08-04
 ### Changed
 - Comp Hero PDF: real static map via Mapbox (light theme, matches institutional aesthetic)
```

`shared/releaseNotes.ts` (exact diff against main):

```diff
diff --git a/shared/releaseNotes.ts b/shared/releaseNotes.ts
index 8026499..25f5a77 100644
--- a/shared/releaseNotes.ts
+++ b/shared/releaseNotes.ts
@@ -11,6 +11,16 @@ export interface ReleaseNote {
 }
 
 export const RELEASE_NOTES: ReleaseNote[] = [
+  {
+    version: "1.8.0",
+    date: "2026-10-21",
+    added: [
+      "Send Flip deals to other users by email, with an optional pre-filled text from your phone",
+      "\"Shared deals\" inbox with Accept & copy / Decline, plus a badge in the header",
+      "Sent tab showing Pending, Invited, Accepted, Declined, and Expired status",
+      "Email invites for recipients without a PropBoxIQ account (30-day expiry)",
+    ],
+  },
   {
     version: "1.7.6",
     date: "2026-08-04",
```

- [ ] **Step 2: Run every gate**

Run: `npm run check && npm run build && npm run test:shares`
Expected: tsc exit 0; build prints `dist/index.cjs` and `copying pdf fonts...` with exit 0; `6 passed, 0 failed`; `PASS  share routes`; node:test `# pass 10`, `# fail 0`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json shared/version.ts CHANGELOG.md shared/releaseNotes.ts
git commit -m "chore(release): v1.8.0 — Deal Sharing"
```

---

## Self-review

- Spec coverage: §2.1 entry/sheet/toasts/SMS → Tasks 1/4/5; §2.2 inbox/tray/accept/decline → Task 6; §2.3 Sent statuses → Tasks 1/2/6; §2.4 link states → Tasks 2/3/6; §2.5 invite + linking + 30-day expiry → Task 2 (case 4); §3–4 data model + payload + transaction → Task 2; §5 API → Task 3; §6 guards → Tasks 2/3 (cases 3–5); §7 components → Tasks 4–6; §8 tests → Task 2 Step 1; §11 release → Task 7.
- Placeholder scan: none — every code step embeds the full file or the exact diff.
- Type consistency: `createShare/acceptShare/declineShare` return `ShareResult<T>` everywhere; routes map `{ok:false}` → `{error}`; client types import from `@shared/dealShares`.
