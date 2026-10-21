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
