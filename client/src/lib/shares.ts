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
