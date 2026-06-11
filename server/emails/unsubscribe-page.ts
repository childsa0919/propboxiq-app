import { COLORS, APP_ORIGIN } from "./layout";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function page(title: string, message: string, actionHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · PropBoxIQ</title>
</head>
<body style="margin:0;background:${COLORS.ink};font-family:${FONT};color:${COLORS.body};">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;">
    <p style="font-size:20px;font-weight:600;letter-spacing:-0.01em;margin:0 0 32px;color:${COLORS.body};">
      PropBox<span style="color:${COLORS.cyan}">IQ</span>
    </p>
    <h1 style="font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.25;margin:0 0 14px;">${title}</h1>
    <p style="font-size:16px;line-height:1.6;color:${COLORS.muted};margin:0 0 28px;">${message}</p>
    ${actionHtml}
  </div>
</body>
</html>`;
}

export function unsubscribedPage(token: string): string {
  const resubUrl = `${APP_ORIGIN}/unsubscribe/resubscribe?token=${encodeURIComponent(token)}`;
  return page(
    "You've been unsubscribed.",
    "We're sorry to see you go — you won't receive any more PropBoxIQ emails. Changed your mind?",
    `<a href="${resubUrl}" style="display:inline-block;background:${COLORS.primary};color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:600;font-size:15px;">Resubscribe</a>`,
  );
}

export function resubscribedPage(): string {
  return page(
    "You're back on the list.",
    "Welcome back — you'll keep getting PropBoxIQ updates.",
    `<a href="${APP_ORIGIN}" style="display:inline-block;background:${COLORS.primary};color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:600;font-size:15px;">Open PropBoxIQ &rarr;</a>`,
  );
}

export function invalidTokenPage(): string {
  return page(
    "This link is no longer valid.",
    "We couldn't find a subscription for this link. It may have already been used or expired.",
    `<a href="${APP_ORIGIN}" style="color:${COLORS.cyan};font-weight:600;text-decoration:none;">&larr; Back to PropBoxIQ</a>`,
  );
}
