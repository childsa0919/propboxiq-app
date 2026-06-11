// Shared building blocks for the welcome-drip emails.
//
// Email clients (Gmail in particular) strip <style> tags in <head>, so every
// rule here is inline. Layout is table-based for Outlook, single-column, and
// capped at 600px. Colors are the Coastal Teal palette used across the app.

export const COLORS = {
  primary: "#126D85",
  cyan: "#5fd4e7",
  ink: "#0a0e12",
  body: "#e6eef2",
  muted: "#8aa0ab",
  panel: "#10242c",
  border: "#1d3b46",
};

export const APP_ORIGIN = "https://app.propboxiq.com";

// Instagram handle is not live yet — leave as a constant to swap in later.
export const INSTAGRAM_URL = "https://instagram.com/propboxiq";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Inline-SVG logo. Mirrors the magic-link email logo but tinted for a dark bg.
function logoSvg(): string {
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

export function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
    <tr><td bgcolor="${COLORS.primary}" style="border-radius:10px;">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:14px 26px;font-family:${FONT_STACK};font-size:16px;font-weight:600;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;border-radius:10px;">
        ${label} &rarr;
      </a>
    </td></tr>
  </table>`;
}

// A small bordered card used to stack the "FLIP vs HOLD" and feature sections.
export function card(title: string, bodyHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin:0 0 14px;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:12px;">
    <tr><td style="padding:18px 20px;">
      <p style="margin:0 0 8px;font-family:${FONT_STACK};font-size:15px;font-weight:700;letter-spacing:0.02em;color:${COLORS.cyan};">${title}</p>
      <div style="font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${COLORS.body};">${bodyHtml}</div>
    </td></tr>
  </table>`;
}

function footer(unsubscribeUrl: string, extraLinksHtml = ""): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;border-top:1px solid ${COLORS.border};">
    <tr><td style="padding:22px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:${COLORS.muted};">
      ${extraLinksHtml}
      <p style="margin:0 0 6px;">PropBoxIQ &middot; Real estate deal analysis that does the math for you.</p>
      <p style="margin:0;">
        <a href="${unsubscribeUrl}" target="_blank" style="color:${COLORS.muted};text-decoration:underline;">Unsubscribe</a>
        from these emails.
      </p>
    </td></tr>
  </table>`;
}

export interface EmailUser {
  firstName: string;
  email: string;
  unsubscribeToken: string;
}

export function unsubscribeUrl(token: string): string {
  return `${APP_ORIGIN}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Wrap inner body HTML in the shared dark shell. */
export function shell(opts: {
  preheader: string;
  bodyHtml: string;
  unsubscribeToken: string;
  extraFooterLinksHtml?: string;
}): string {
  const unsub = unsubscribeUrl(opts.unsubscribeToken);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:${COLORS.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${opts.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.ink};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 8px 28px;">${logoSvg()}</td></tr>
        <tr><td style="padding:0 8px;">
          ${opts.bodyHtml}
          ${footer(unsub, opts.extraFooterLinksHtml ?? "")}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Derive a friendly first name from a stored full name / email. */
export function firstNameOf(name: string | null | undefined, email: string): string {
  const fromName = (name ?? "").trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split("@")[0] ?? "there";
  // Title-case the email local part as a last resort ("jane.doe" -> "Jane").
  const first = local.split(/[._-]/)[0] || "there";
  return first.charAt(0).toUpperCase() + first.slice(1);
}
