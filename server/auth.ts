import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { storage } from "./storage";

const SESSION_COOKIE = "pbq_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const TOKEN_TTL_MS = 1000 * 60 * 30; // 30 min

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Read the session id from the request cookie. */
function readSessionCookie(req: Request): string | null {
  const raw = req.headers.cookie ?? "";
  const m = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!m) return null;
  return decodeURIComponent(m.slice(SESSION_COOKIE.length + 1));
}

/** Issue a fresh session cookie. */
export function setSessionCookie(res: Response, sessionId: string) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

/**
 * AUTH TOGGLE — temporarily disabled until Google OAuth ships.
 * Default is disabled. To re-enable magic-link auth: set ENABLE_AUTH=1 in env
 * AND flip AUTH_ENABLED=true in client/src/App.tsx, then redeploy.
 */
const authExplicitlyEnabled =
  process.env.ENABLE_AUTH === "1" || process.env.ENABLE_AUTH === "true";
export const AUTH_DISABLED = !authExplicitlyEnabled;
export const GUEST_USER_ID = 1;

/**
 * PREVIEW MODE — temporary auth bypass for Render PR previews.
 * Active when PREVIEW_MODE=1 in the server env. Treats every request as
 * the dedicated preview user (info@propboxiq.com) so save/email/analyze
 * still work without a real session. Production has neither this env var
 * nor the client `?preview=1` flag.
 *
 * To revert: delete this PREVIEW MODE block, the `previewActive` branch
 * in sessionMiddleware/requireAuth, and the client previewMode.ts file.
 */
export const PREVIEW_MODE =
  process.env.PREVIEW_MODE === "1" || process.env.PREVIEW_MODE === "true";
const PREVIEW_EMAIL = "info@propboxiq.com";
const PREVIEW_NAME = "Preview User";
let cachedPreviewUserId: number | null = null;
async function getPreviewUserId(): Promise<number> {
  if (cachedPreviewUserId !== null) return cachedPreviewUserId;
  const u = await storage.upsertUser(PREVIEW_EMAIL, PREVIEW_NAME);
  cachedPreviewUserId = u.id;
  return u.id;
}

/**
 * Session middleware — attaches `req.userId` if a valid session cookie exists.
 * Does NOT block unauthenticated requests; route handlers decide.
 * When auth is disabled, attaches the shared guest user id.
 */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (AUTH_DISABLED) {
    (req as any).userId = GUEST_USER_ID;
    return next();
  }
  if (PREVIEW_MODE) {
    try {
      (req as any).userId = await getPreviewUserId();
    } catch (e) {
      console.error("[preview] failed to resolve preview user", e);
    }
    return next();
  }
  const sid = readSessionCookie(req);
  if (sid) {
    const session = await storage.getSession(sid);
    if (session) (req as any).userId = session.userId;
  }
  next();
}

/** Use after sessionMiddleware. Returns 401 if not signed in. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (AUTH_DISABLED || PREVIEW_MODE) return next();
  const userId = (req as any).userId as number | undefined;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}

export const TIMINGS = {
  SESSION_TTL_MS,
  TOKEN_TTL_MS,
  SESSION_COOKIE,
};

// ---------- Email sending via Resend ----------
const RESEND_FROM = process.env.RESEND_FROM ?? "PropBoxIQ <onboarding@resend.dev>";

export async function sendMagicLinkEmail(opts: {
  to: string;
  link: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[auth] RESEND_API_KEY missing — magic link will be logged only");
    console.log("[auth] Magic link for", opts.to, ":", opts.link);
    return { ok: true };
  }
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [opts.to],
        subject: "Your PropBoxIQ sign-in link",
        html: magicLinkHtml(opts.link),
        text: `Sign in to PropBoxIQ:\n\n${opts.link}\n\nThis link expires in 30 minutes.`,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error("[auth] Resend error", resp.status, body);
      return { ok: false, error: `Email send failed (${resp.status})` };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[auth] Resend exception", e);
    return { ok: false, error: e?.message ?? "Email send failed" };
  }
}

/**
 * Generic email send via Resend with optional file attachment.
 * Used for the user-initiated "Email Deal Memo" feature — the magic-link
 * helper above stays specialized for sign-in emails.
 *
 * Returns { ok: true } when Resend accepts the request. When RESEND_API_KEY
 * is missing we log and pretend it succeeded so local dev still works
 * (mirrors the magic-link behavior so they're consistent in dev).
 */
export async function sendEmailWithAttachment(opts: {
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachment: { filename: string; contentBase64: string; contentType?: string };
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY missing — simulated send for",
      opts.to,
      `(subject: ${opts.subject})`,
    );
    return { ok: true };
  }
  try {
    const body: Record<string, unknown> = {
      from: RESEND_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      attachments: [
        {
          filename: opts.attachment.filename,
          content: opts.attachment.contentBase64,
          content_type: opts.attachment.contentType ?? "application/pdf",
        },
      ],
    };
    if (opts.cc) body.cc = [opts.cc];
    if (opts.replyTo) body.reply_to = opts.replyTo;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.error("[email] Resend error", resp.status, text);
      return { ok: false, error: `Email send failed (${resp.status})` };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[email] Resend exception", e);
    return { ok: false, error: e?.message ?? "Email send failed" };
  }
}

function magicLinkHtml(link: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f8f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0e12;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">
    <div style="display:inline-flex;align-items:center;gap:8px;font-size:18px;font-weight:600;letter-spacing:-0.01em;margin-bottom:32px;">
      <svg width="28" height="28" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd"
              d="M10 6 L34 6 Q38 6 38 10 L38 34 Q38 38 34 38 L10 38 Q6 38 6 34 L6 10 Q6 6 10 6 Z M21.30 15.10 Q22.00 14.60 22.70 15.10 L30.00 20.90 L30.00 32.60 Q30.00 38.00 31.50 38.00 L12.50 38.00 Q14.00 38.00 14.00 32.60 L14.00 20.90 L21.30 15.10 Z"
              fill="#0a0e12"/>
        <rect x="42" y="6" width="32" height="32" rx="4" fill="#0a0e12"/>
        <rect x="6" y="42" width="32" height="32" rx="4" fill="#0a0e12"/>
        <rect x="42" y="42" width="32" height="32" rx="4" fill="#126D85"/>
      </svg>
      <span>PropBox<span style="color:#126D85">IQ</span></span>
    </div>
    <h1 style="font-size:26px;font-weight:600;letter-spacing:-0.025em;margin:0 0 12px;line-height:1.2;">Sign in to PropBoxIQ</h1>
    <p style="margin:0 0 28px;color:#475569;font-size:15px;line-height:1.55;">Click the button below to sign in. This link expires in 30 minutes and can only be used once.</p>
    <a href="${link}" style="display:inline-block;background:#126D85;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:-0.01em;">Sign in &rarr;</a>
    <p style="margin:32px 0 0;color:#94a3b8;font-size:13px;line-height:1.55;word-break:break-all;">If the button doesn't work, paste this URL into your browser:<br><span style="color:#475569">${link}</span></p>
    <p style="margin:40px 0 0;color:#94a3b8;font-size:12px;line-height:1.55;border-top:1px solid #e2e8f0;padding-top:20px;">If you didn't request this, you can ignore this email. No account will be created.</p>
  </div>
</body></html>`;
}
