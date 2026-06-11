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

export function dripDay5Email(user: EmailUser): RenderedEmail {
  const subject = "3 features most PropBoxIQ users haven't found yet";
  const cta = APP_ORIGIN;

  const bodyHtml = `
    <h1 style="margin:0 0 14px;font-family:${FONT};font-size:24px;font-weight:700;letter-spacing:-0.02em;line-height:1.3;color:${COLORS.body};">
      ${user.firstName}, you've barely scratched the surface.
    </h1>
    <p style="margin:0 0 22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.body};">
      Three things PropBoxIQ does automatically that most people miss:
    </p>
    ${card(
      "1 · RENT COMPS",
      `Hit <strong>Step 5</strong> of a Hold analysis and PropBoxIQ pulls live rent comps for the neighborhood — no separate lookup, no guessing at market rent.`,
    )}
    ${card(
      "2 · BRRRR FEASIBILITY",
      `We derive <strong>ARV from real comps</strong>, so the refinance step of a BRRRR is grounded in data instead of a hopeful number you typed in.`,
    )}
    ${card(
      "3 · EDITABLE OPEX",
      `Every operating-expense line is <strong>editable</strong>. Swap in your insurance quote, your property-management rate, your numbers — and the analysis updates instantly.`,
    )}
    <p style="margin:18px 0 22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${COLORS.body};">
      Open PropBoxIQ and try one on a deal you're already watching.
    </p>
    ${ctaButton("Open PropBoxIQ", cta)}
  `;

  const html = shell({
    preheader: "Rent comps, BRRRR feasibility, and editable OpEx — already built in.",
    bodyHtml,
    unsubscribeToken: user.unsubscribeToken,
  });

  const text = `3 features most PropBoxIQ users haven't found yet

${user.firstName}, you've barely scratched the surface. Three things PropBoxIQ does automatically that most people miss:

1. RENT COMPS — Hit Step 5 of a Hold analysis and PropBoxIQ pulls live rent comps for the neighborhood. No separate lookup, no guessing at market rent.

2. BRRRR FEASIBILITY — We derive ARV from real comps, so the refinance step is grounded in data instead of a hopeful number you typed in.

3. EDITABLE OPEX — Every operating-expense line is editable. Swap in your insurance quote, your PM rate, your numbers — the analysis updates instantly.

Open PropBoxIQ and try one on a deal you're already watching:
${cta}

Unsubscribe: ${unsubscribeUrl(user.unsubscribeToken)}`;

  return { subject, html, text };
}
