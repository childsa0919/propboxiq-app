import {
  shell,
  ctaButton,
  card,
  unsubscribeUrl,
  APP_ORIGIN,
  COLORS,
  type EmailUser,
} from "./layout";
import type { RenderedEmail } from "./welcome";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function dripDay2Email(user: EmailUser): RenderedEmail {
  const subject = "Flip or Hold? Here's the 60-second breakdown";
  const cta = `${APP_ORIGIN}/hold`;

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;font-weight:700;letter-spacing:-0.02em;line-height:1.3;color:${COLORS.body};">
      Every property tells a story. The trick is knowing which one.
    </h1>
    <p style="margin:0 0 22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.body};">
      Same address, two completely different plays. Here's how to tell them apart fast.
    </p>
    ${card(
      "WHEN TO FLIP",
      `<ul style="margin:0;padding-left:18px;">
        <li style="margin:0 0 6px;">The <strong>ARV spread</strong> covers rehab plus your margin with room left over.</li>
        <li style="margin:0 0 6px;">The <strong>rehab math</strong> is known and contained — no surprise foundation work.</li>
        <li style="margin:0;"><strong>Time-to-sale</strong> is short enough that holding costs don't eat the profit.</li>
      </ul>`,
    )}
    ${card(
      "WHEN TO HOLD",
      `<ul style="margin:0;padding-left:18px;">
        <li style="margin:0 0 6px;"><strong>Cash flow</strong> clears the mortgage, taxes, and a maintenance buffer.</li>
        <li style="margin:0 0 6px;"><strong>Equity build</strong> from paydown and appreciation compounds over time.</li>
        <li style="margin:0;">The <strong>crossover year</strong> — when holding beats flipping — comes early.</li>
      </ul>`,
    )}
    <p style="margin:18px 0 22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.body};">
      Not sure which way a deal leans? Run it through the Hold analyzer and let the numbers decide.
    </p>
    ${ctaButton("Try the Hold analyzer", cta)}
  `;

  const html = shell({
    preheader: "Flip for the spread, hold for the cash flow — here's how to tell.",
    bodyHtml,
    unsubscribeToken: user.unsubscribeToken,
  });

  const text = `Flip or Hold? Here's the 60-second breakdown

Every property tells a story. The trick is knowing which one.

WHEN TO FLIP
- The ARV spread covers rehab plus your margin with room left over.
- The rehab math is known and contained — no surprise foundation work.
- Time-to-sale is short enough that holding costs don't eat the profit.

WHEN TO HOLD
- Cash flow clears the mortgage, taxes, and a maintenance buffer.
- Equity build from paydown and appreciation compounds over time.
- The crossover year — when holding beats flipping — comes early.

Not sure which way a deal leans? Run it through the Hold analyzer:
${cta}

Unsubscribe: ${unsubscribeUrl(user.unsubscribeToken)}`;

  return { subject, html, text };
}
