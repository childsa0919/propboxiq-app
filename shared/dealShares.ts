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
