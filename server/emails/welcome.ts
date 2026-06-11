import {
  shell,
  ctaButton,
  unsubscribeUrl,
  INSTAGRAM_URL,
  APP_ORIGIN,
  COLORS,
  type EmailUser,
} from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function welcomeEmail(user: EmailUser): RenderedEmail {
  const subject = "Welcome to PropBoxIQ — let's score your first deal";
  const cta = `${APP_ORIGIN}/quick`;

  const extraFooterLinksHtml = `<p style="margin:0 0 10px;">
    <a href="${INSTAGRAM_URL}" target="_blank" style="color:${COLORS.cyan};text-decoration:none;">Instagram</a>
    &nbsp;&middot;&nbsp;
    <a href="mailto:info@propboxiq.com" style="color:${COLORS.cyan};text-decoration:none;">Reply to this email</a>
  </p>`;

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-family:${FONT};font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.25;color:${COLORS.body};">
      Welcome, ${user.firstName}.
    </h1>
    <p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.body};">
      PropBoxIQ runs the numbers on a property the moment you paste in an address — purchase, rehab, holding costs, financing, and the profit math behind a flip or a hold. No spreadsheets, no guessing.
    </p>
    <p style="margin:0 0 22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.body};">
      The fastest way to see it work is to score a deal right now. Drop in any address and watch the analysis fill in.
    </p>
    ${ctaButton("Score your first deal", cta)}
  `;

  const html = shell({
    preheader: "Run the numbers on your first deal in under a minute.",
    bodyHtml,
    unsubscribeToken: user.unsubscribeToken,
    extraFooterLinksHtml,
  });

  const text = `Welcome, ${user.firstName}.

PropBoxIQ runs the numbers on a property the moment you paste in an address — purchase, rehab, holding costs, financing, and the profit math behind a flip or a hold. No spreadsheets, no guessing.

The fastest way to see it work is to score a deal right now:
${cta}

Instagram: ${INSTAGRAM_URL}
Questions? Just reply to this email.

Unsubscribe: ${unsubscribeUrl(user.unsubscribeToken)}`;

  return { subject, html, text };
}
