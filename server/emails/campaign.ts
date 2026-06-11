// Welcome-drip orchestration: sends the welcome email immediately on first
// OAuth login, schedules the Day-2 and Day-5 follow-ups via Resend's
// `scheduled_at` (no cron infra needed), and syncs the user into the
// "PropBoxIQ Users" Resend audience for future broadcasts.
//
// Everything here is best-effort: a failed Resend call logs and returns
// gracefully so it can never block login. Idempotency is enforced by the
// caller via the `*_sent_at` columns on the users table.

import { storage } from "../storage";
import type { User } from "@shared/schema";
import { welcomeEmail } from "./welcome";
import { dripDay2Email } from "./drip-day2";
import { dripDay5Email } from "./drip-day5";
import { firstNameOf, unsubscribeUrl, type EmailUser } from "./layout";

const RESEND_API = "https://api.resend.com";
const RESEND_FROM = process.env.RESEND_FROM ?? "PropBoxIQ <info@propboxiq.com>";

const DAY_MS = 24 * 60 * 60 * 1000;

function apiKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

function toEmailUser(user: User): EmailUser {
  return {
    firstName: firstNameOf(user.name, user.email),
    email: user.email,
    unsubscribeToken: user.unsubscribeToken ?? "",
  };
}

interface SendOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeToken: string;
  scheduledAt?: string; // ISO 8601; omitted = send now
}

// Low-level Resend send. Always attaches the RFC-8058 List-Unsubscribe headers
// so inbox providers render a native one-click unsubscribe in addition to the
// in-body link.
async function sendViaResend(opts: SendOpts): Promise<{ ok: boolean; error?: string }> {
  const key = apiKey();
  if (!key) {
    console.warn(
      "[campaign] RESEND_API_KEY missing — simulated send to",
      opts.to,
      `(subject: ${opts.subject}${opts.scheduledAt ? `, scheduled ${opts.scheduledAt}` : ""})`,
    );
    return { ok: true };
  }
  const unsubUrl = unsubscribeUrl(opts.unsubscribeToken);
  const body: Record<string, unknown> = {
    from: RESEND_FROM,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
  if (opts.scheduledAt) body.scheduled_at = opts.scheduledAt;

  try {
    const resp = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[campaign] Resend send error", resp.status, t);
      return { ok: false, error: `send failed (${resp.status})` };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[campaign] Resend send exception", e);
    return { ok: false, error: e?.message ?? "send failed" };
  }
}

// ---------- Resend Audiences ----------

/** Add (or update) the user's email in the "PropBoxIQ Users" audience. */
export async function addContactToAudience(user: User): Promise<void> {
  const key = apiKey();
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!key || !audienceId) {
    if (!audienceId) console.warn("[campaign] RESEND_AUDIENCE_ID missing — skipping audience sync");
    return;
  }
  try {
    const resp = await fetch(`${RESEND_API}/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        first_name: firstNameOf(user.name, user.email),
        unsubscribed: false,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[campaign] audience add error", resp.status, t);
    }
  } catch (e) {
    console.error("[campaign] audience add exception", e);
  }
}

/** Mark the contact unsubscribed in the audience so broadcasts skip them. */
export async function unsubscribeContactInAudience(email: string): Promise<void> {
  const key = apiKey();
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!key || !audienceId) return;
  try {
    // Resend lets you address a contact by email under the audience.
    const resp = await fetch(
      `${RESEND_API}/audiences/${audienceId}/contacts/${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ unsubscribed: true }),
      },
    );
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[campaign] audience unsubscribe error", resp.status, t);
    }
  } catch (e) {
    console.error("[campaign] audience unsubscribe exception", e);
  }
}

// ---------- First-login entry point ----------

/**
 * Fire the full welcome sequence for a brand-new user. Sends Email 1 now and
 * schedules Emails 2 and 3 for T+2d / T+5d via Resend. Marks the matching
 * `*_sent_at` columns so a re-run (or the cron fallback) never double-sends.
 *
 * Best-effort throughout — caller should not await-block login on this, and
 * any failure is swallowed after logging.
 */
export async function runWelcomeDrip(user: User): Promise<void> {
  // Guard: never (re)send to an unsubscribed user or one already welcomed.
  if (user.unsubscribedAt || user.welcomeEmailSentAt) return;

  const eu = toEmailUser(user);
  const now = Date.now();

  // Email 1 — immediate welcome.
  const welcome = welcomeEmail(eu);
  const res1 = await sendViaResend({
    to: user.email,
    subject: welcome.subject,
    html: welcome.html,
    text: welcome.text,
    unsubscribeToken: eu.unsubscribeToken,
  });
  if (res1.ok) await storage.markWelcomeSent(user.id);

  // Audience sync (after first send so the contact exists for broadcasts).
  await addContactToAudience(user);

  // Email 2 — scheduled T+2 days.
  const d2 = dripDay2Email(eu);
  const res2 = await sendViaResend({
    to: user.email,
    subject: d2.subject,
    html: d2.html,
    text: d2.text,
    unsubscribeToken: eu.unsubscribeToken,
    scheduledAt: new Date(now + 2 * DAY_MS).toISOString(),
  });
  if (res2.ok) await storage.markDrip2Sent(user.id);

  // Email 3 — scheduled T+5 days.
  const d5 = dripDay5Email(eu);
  const res5 = await sendViaResend({
    to: user.email,
    subject: d5.subject,
    html: d5.html,
    text: d5.text,
    unsubscribeToken: eu.unsubscribeToken,
    scheduledAt: new Date(now + 5 * DAY_MS).toISOString(),
  });
  if (res5.ok) await storage.markDrip5Sent(user.id);
}

// ---------- Cron fallback (Option A) ----------

/**
 * Send any drip emails currently due. Used by POST /api/internal/send-drip-batch
 * as a safety net / alternative to Resend scheduling. Idempotent via the
 * `*_sent_at` columns and skips unsubscribed users at the query level.
 */
export async function sendDripBatch(): Promise<{ day2: number; day5: number }> {
  const now = Date.now();
  let day2 = 0;
  let day5 = 0;

  for (const user of await storage.usersDueForDrip2(now)) {
    if (user.unsubscribedAt) continue;
    const eu = toEmailUser(user);
    const mail = dripDay2Email(eu);
    const r = await sendViaResend({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      unsubscribeToken: eu.unsubscribeToken,
    });
    if (r.ok) {
      await storage.markDrip2Sent(user.id);
      day2++;
    }
  }

  for (const user of await storage.usersDueForDrip5(now)) {
    if (user.unsubscribedAt) continue;
    const eu = toEmailUser(user);
    const mail = dripDay5Email(eu);
    const r = await sendViaResend({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      unsubscribeToken: eu.unsubscribeToken,
    });
    if (r.ok) {
      await storage.markDrip5Sent(user.id);
      day5++;
    }
  }

  return { day2, day5 };
}
