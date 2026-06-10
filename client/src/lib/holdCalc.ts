// Hold (buy-and-hold rental) underwriting engine.
// Pure functions — fully deterministic and testable. All money in dollars,
// all rates in percent unless noted. Mirrors the Flip engine in calc.ts but
// models monthly cash flow, financing (PITI), reserves, and the dual
// Long-term / Short-term Hold Scores.

export interface HoldInputs {
  purchasePrice: number;
  rehab: number; // 0 when the rehab toggle is off
  monthlyRent: number;
  // Financing
  downPct: number; // % of purchase price
  ratePct: number; // annual interest rate %
  termYears: number; // amortization term
  // Carrying — pulled from RentCast when available, else estimated
  annualPropertyTax: number; // $/yr
  annualInsurance: number; // $/yr (estimated 0.5% of price if unknown)
  // Reserves & vacancy (each a % of gross monthly rent)
  vacancyPct: number;
  managementPct: number;
  maintenancePct: number;
  capexPct: number;
  // Market references (for relative scoring) — optional
  marketCapRatePct?: number | null; // RentCast market cap rate
  valueEstimate?: number | null; // RentCast value estimate / Zestimate for margin
}

export interface HoldResults {
  loanAmount: number;
  downPayment: number;
  cashInvested: number; // down + rehab + estimated closing
  monthlyPI: number; // principal + interest
  monthlyTax: number;
  monthlyInsurance: number;
  piti: number; // P&I + tax + insurance
  // Reserves (monthly $)
  vacancy: number;
  management: number;
  maintenance: number;
  capex: number;
  reservesTotal: number;
  // Cash flow
  monthlyCashFlow: number;
  annualCashFlow: number;
  // Returns
  noi: number; // annual net operating income (excludes debt service)
  capRatePct: number; // NOI / purchase price
  cashOnCashPct: number; // annual cash flow / cash invested
  dscr: number; // NOI / annual debt service
  annualPrincipalPaydown: number; // year-1 principal portion
  equityBuildPct: number; // annual paydown / cash invested
  marginPct: number; // (value est - price) / value est
  rentToPricePct: number; // annual rent / price
  // Scores
  longScore: number; // 0-100
  shortScore: number; // 0-100
}

const pct = (n: number) => (n || 0) / 100;

/** Year-1 principal paydown on a fully-amortizing loan. */
function firstYearPrincipal(
  loanAmount: number,
  annualRatePct: number,
  termYears: number,
  monthlyPI: number,
): number {
  if (loanAmount <= 0) return 0;
  const r = pct(annualRatePct) / 12;
  let balance = loanAmount;
  let principalPaid = 0;
  for (let m = 0; m < 12 && m < termYears * 12; m++) {
    const interest = balance * r;
    const principal = monthlyPI - interest;
    principalPaid += principal;
    balance -= principal;
  }
  return Math.max(0, principalPaid);
}

/** Standard amortized monthly payment for principal + interest. */
export function amortizedPayment(
  loanAmount: number,
  annualRatePct: number,
  termYears: number,
): number {
  if (loanAmount <= 0) return 0;
  const r = pct(annualRatePct) / 12;
  const n = termYears * 12;
  if (r === 0) return loanAmount / n;
  return (loanAmount * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Piecewise-linear interpolation across a curve of [x, score] anchor points.
 * Clamps below the first anchor and above the last.
 */
export function interpolateCurve(
  x: number,
  anchors: ReadonlyArray<readonly [number, number]>,
): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

// DMV-tuned monthly cash flow curve (per door). Peaks at $1500 — diminishing
// returns above. Interpolated linearly between anchors.
export const CASHFLOW_ANCHORS = [
  [0, 0],
  [200, 40],
  [500, 65],
  [800, 80],
  [1200, 90],
  [1500, 95],
  [2000, 100],
] as const;

// Cash-on-cash curve (general).
export const COC_ANCHORS = [
  [-1, 0], // <0% clamps to 0 (anchor below 0 keeps slope sane)
  [0, 30],
  [5, 55],
  [8, 75],
  [12, 90],
  [15, 100],
] as const;

// DSCR curve.
export const DSCR_ANCHORS = [
  [1.0, 40],
  [1.2, 70],
  [1.5, 90],
  [1.8, 100],
] as const;

// Equity-build curve (annual principal paydown / cash invested, in %).
export const EQUITY_ANCHORS = [
  [0, 0],
  [5, 50],
  [10, 85],
  [15, 100],
] as const;

// Margin curve (purchase price vs value est; positive = below market, in %).
export const MARGIN_ANCHORS = [
  [0, 50],
  [5, 80],
  [10, 100],
] as const;

// Rent-to-price curve (annual rent / price, in %).
export const RENT_TO_PRICE_ANCHORS = [
  [8, 0],
  [10, 60],
  [12, 85],
  [14, 100],
] as const;

function scoreDscr(dscr: number): number {
  if (dscr < 1.0) return 0;
  return interpolateCurve(dscr, DSCR_ANCHORS);
}

function scoreCoc(cocPct: number): number {
  if (cocPct < 0) return 0;
  return interpolateCurve(cocPct, COC_ANCHORS);
}

function scoreMargin(marginPct: number): number {
  if (marginPct < 0) return 0;
  return interpolateCurve(marginPct, MARGIN_ANCHORS);
}

function scoreRentToPrice(rtpPct: number): number {
  if (rtpPct < 8) return 0;
  return interpolateCurve(rtpPct, RENT_TO_PRICE_ANCHORS);
}

function scoreEquityBuild(eqPct: number): number {
  return interpolateCurve(eqPct, EQUITY_ANCHORS);
}

// Cap rate vs market: ±25% delta maps 100→0. At market = 100, 25% below
// market (worse) = 0, 25% above (better) clamps at 100.
function scoreCapVsMarket(
  capRatePct: number,
  marketCapPct: number | null | undefined,
): number {
  if (!marketCapPct || marketCapPct <= 0) {
    // No market reference — score the absolute cap rate on a reasonable band
    // (4% → 50, 7%+ → 100, <4% scales down). Keeps the weight meaningful.
    return interpolateCurve(capRatePct, [
      [3, 0],
      [4, 50],
      [6, 85],
      [7, 100],
    ]);
  }
  const delta = (capRatePct - marketCapPct) / marketCapPct; // -1..+inf
  // delta of -0.25 → 0, 0 → 50? Spec: "±25% delta → 100→0". Read as: at +25%
  // delta you cap at 100, at -25% you bottom at 0, linear through the middle.
  const score = 50 + (delta / 0.25) * 50;
  return Math.max(0, Math.min(100, score));
}

export function calculateHold(i: HoldInputs): HoldResults {
  const downPayment = i.purchasePrice * pct(i.downPct);
  const loanAmount = Math.max(0, i.purchasePrice - downPayment);

  const monthlyPI = amortizedPayment(loanAmount, i.ratePct, i.termYears);
  const monthlyTax = i.annualPropertyTax / 12;
  const monthlyInsurance = i.annualInsurance / 12;
  const piti = monthlyPI + monthlyTax + monthlyInsurance;

  const rent = i.monthlyRent;
  const vacancy = rent * pct(i.vacancyPct);
  const management = rent * pct(i.managementPct);
  const maintenance = rent * pct(i.maintenancePct);
  const capex = rent * pct(i.capexPct);
  const reservesTotal = vacancy + management + maintenance + capex;

  const monthlyCashFlow = rent - piti - reservesTotal;
  const annualCashFlow = monthlyCashFlow * 12;

  // NOI excludes debt service but includes operating expenses (tax, insurance,
  // vacancy, management, maintenance, capex). Standard real-estate NOI.
  const annualOpEx =
    (monthlyTax + monthlyInsurance + reservesTotal) * 12;
  const noi = rent * 12 - annualOpEx;
  const capRatePct = i.purchasePrice > 0 ? (noi / i.purchasePrice) * 100 : 0;

  // Closing costs: standard ~2% of purchase for a hold acquisition.
  const closing = i.purchasePrice * 0.02;
  const cashInvested = downPayment + i.rehab + closing;
  const cashOnCashPct =
    cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0;

  const annualDebtService = monthlyPI * 12;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;

  const annualPrincipalPaydown = firstYearPrincipal(
    loanAmount,
    i.ratePct,
    i.termYears,
    monthlyPI,
  );
  const equityBuildPct =
    cashInvested > 0 ? (annualPrincipalPaydown / cashInvested) * 100 : 0;

  const valueEst = i.valueEstimate && i.valueEstimate > 0 ? i.valueEstimate : null;
  const marginPct =
    valueEst != null ? ((valueEst - i.purchasePrice) / valueEst) * 100 : 0;

  const rentToPricePct =
    i.purchasePrice > 0 ? ((rent * 12) / i.purchasePrice) * 100 : 0;

  // --- Component scores (0-100) ---
  const sCoc = scoreCoc(cashOnCashPct);
  const sDscr = scoreDscr(dscr);
  const sCap = scoreCapVsMarket(capRatePct, i.marketCapRatePct);
  const sEquity = scoreEquityBuild(equityBuildPct);
  const sMargin = scoreMargin(marginPct);
  const sRtp = scoreRentToPrice(rentToPricePct);
  const sCashflow = interpolateCurve(monthlyCashFlow, CASHFLOW_ANCHORS);

  // Long-term Hold Score weights
  const longScore =
    0.25 * sCoc +
    0.25 * sDscr +
    0.2 * sCap +
    0.15 * sEquity +
    0.1 * sMargin +
    0.05 * sRtp;

  // Short-term Hold Score weights
  const shortScore =
    0.5 * sCashflow +
    0.2 * sCoc +
    0.15 * sMargin +
    0.1 * sDscr +
    0.05 * sCap;

  return {
    loanAmount,
    downPayment,
    cashInvested,
    monthlyPI,
    monthlyTax,
    monthlyInsurance,
    piti,
    vacancy,
    management,
    maintenance,
    capex,
    reservesTotal,
    monthlyCashFlow,
    annualCashFlow,
    noi,
    capRatePct,
    cashOnCashPct,
    dscr,
    annualPrincipalPaydown,
    equityBuildPct,
    marginPct,
    rentToPricePct,
    longScore: Math.round(Math.max(0, Math.min(100, longScore))),
    shortScore: Math.round(Math.max(0, Math.min(100, shortScore))),
  };
}

export type DivergenceFlavor = {
  kind: "unicorn" | "slow-burn" | "cash-cow" | "pass";
  tone: "gold" | "red";
  icon: string;
  headline: string;
  detail: string;
} | null;

/**
 * Divergence callout logic. Renders only when |Long − Short| >= 10, except the
 * "Pass" flavor which fires whenever both scores are < 50 (alignment doesn't
 * matter when neither horizon works).
 */
export function divergenceCallout(
  longScore: number,
  shortScore: number,
): DivergenceFlavor {
  const spread = Math.abs(longScore - shortScore);

  // Both < 50 → Pass (red), regardless of spread.
  if (longScore < 50 && shortScore < 50) {
    return {
      kind: "pass",
      tone: "red",
      icon: "✕",
      headline: "Pass — neither horizon works",
      detail:
        "Both long-term and short-term scores are weak. The numbers don't support this hold at any time frame.",
    };
  }

  if (spread < 10) return null;

  // Both >= 80 → Unicorn.
  if (longScore >= 80 && shortScore >= 80) {
    return {
      kind: "unicorn",
      tone: "gold",
      icon: "🦄",
      headline: "Unicorn — write the offer",
      detail:
        "Strong on both horizons. Cash flow today and appreciation tomorrow — this is the rare one.",
    };
  }

  // Long > Short by 10+, Short < 70 → Slow burn, strong equity.
  if (longScore - shortScore >= 10 && shortScore < 70) {
    return {
      kind: "slow-burn",
      tone: "gold",
      icon: "↗",
      headline: "Slow burn, strong equity",
      detail: `Long > Short by ${longScore - shortScore} pts. Cash flow is modest but the real return is appreciation + paydown. A long-hold play.`,
    };
  }

  // Short > Long by 10+, Long < 70 → Cash cow, weak appreciation.
  if (shortScore - longScore >= 10 && longScore < 70) {
    return {
      kind: "cash-cow",
      tone: "gold",
      icon: "💵",
      headline: "Cash cow, weak appreciation",
      detail: `Short > Long by ${shortScore - longScore} pts. Good immediate yield, but appreciation and equity build lag. Milk the cash flow.`,
    };
  }

  return null;
}
