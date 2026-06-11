// 10-year projection + BRRRR helpers for the Hold result page (v2 / Mock 3A).
// Pure, deterministic functions that CONSUME the locked holdCalc engine — they
// add no new scoring math, only forward-looking projections built from the same
// inputs/outputs. All money in dollars, all rates in percent unless noted.

import {
  amortizedPayment,
  calculateHold,
  sumPrincipalPaid,
  type HoldInputs,
  type HoldResults,
} from "@/lib/holdCalc";

const pct = (n: number) => (n || 0) / 100;

// Growth assumptions for the 10-year pro-forma. Documented constants so the
// projection is reproducible and easy to tune later.
export const RENT_GROWTH_PCT = 3; // annual rent growth
export const EXPENSE_GROWTH_PCT = 3; // annual operating-expense growth
export const APPRECIATION_PCT = 3; // annual property appreciation

/**
 * Per-year average MONTHLY cash flow over `years`. Year 1 equals the engine's
 * monthlyCashFlow. Rent and reserves grow at RENT_GROWTH_PCT, the fixed PITI
 * carries flat (fully amortizing, fixed-rate), tax + insurance grow at
 * EXPENSE_GROWTH_PCT. Returns an array of length `years` (index 0 = Year 1).
 */
export function projectCashFlow(input: HoldInputs, years = 10): number[] {
  const r = calculateHold(input);
  const out: number[] = [];
  for (let y = 1; y <= years; y++) {
    const rentG = Math.pow(1 + pct(RENT_GROWTH_PCT), y - 1);
    const expG = Math.pow(1 + pct(EXPENSE_GROWTH_PCT), y - 1);
    const rent = input.monthlyRent * rentG;
    // Reserves are a % of gross rent → grow with rent.
    const reserves = r.reservesTotal * rentG;
    // Tax + insurance grow with expenses; P&I is fixed.
    const carry = r.monthlyPI + (r.monthlyTax + r.monthlyInsurance) * expG;
    out.push(Math.round(rent - carry - reserves));
  }
  return out;
}

export interface EquityYear {
  principal: number; // cumulative principal paid down through year y
  appreciation: number; // cumulative appreciation through year y
  cumCashFlow: number; // cumulative cash flow through year y (floored at 0)
  total: number; // principal + appreciation + max(0, cumCashFlow)
}

/**
 * Cumulative equity build by year: principal paydown (from the amortization
 * schedule), appreciation (compounded on purchase price), and cumulative cash
 * flow. Cumulative cash flow is floored at 0 in `total` so a deal that bleeds
 * early doesn't show "negative equity" — matches the stacked-area treatment in
 * the mock. Returns an array of length `years` (index 0 = Year 1).
 */
export function projectEquity(input: HoldInputs, years = 10): EquityYear[] {
  const r = calculateHold(input);
  const cf = projectCashFlow(input, years);
  const out: EquityYear[] = [];
  let runningCashFlow = 0;
  for (let y = 1; y <= years; y++) {
    const principal = sumPrincipalPaid(
      r.loanAmount,
      input.ratePct,
      input.termYears,
      y * 12,
    );
    const appreciation =
      input.purchasePrice * (Math.pow(1 + pct(APPRECIATION_PCT), y) - 1);
    runningCashFlow += cf[y - 1] * 12;
    const total = principal + appreciation + Math.max(0, runningCashFlow);
    out.push({
      principal: Math.round(principal),
      appreciation: Math.round(appreciation),
      cumCashFlow: Math.round(runningCashFlow),
      total: Math.round(total),
    });
  }
  return out;
}

/**
 * The whole year (1..years) where projected monthly cash flow first turns
 * non-negative, or null if it never does within the horizon. Used to annotate
 * the cash-flow chart with a crossover dot.
 */
export function cashFlowBreakevenYear(
  cashFlow: number[],
): number | null {
  for (let i = 0; i < cashFlow.length; i++) {
    if (cashFlow[i] >= 0) return i + 1;
  }
  return null;
}

/** Approximate IRR via cumulative-return CAGR on invested cash. Not a true
 * cash-flow IRR (no per-period solve) — a transparent proxy consistent with the
 * "Return / IRR" strip in the mock. Returns annualized % over `year` years. */
export function approxIrrPct(
  totalReturn: number,
  cashInvested: number,
  year: number,
): number {
  if (cashInvested <= 0 || year <= 0) return 0;
  const multiple = (cashInvested + totalReturn) / cashInvested;
  if (multiple <= 0) return 0;
  return (Math.pow(multiple, 1 / year) - 1) * 100;
}

// --- Operating-expense breakdown -------------------------------------------

export interface OpExSlice {
  key: string;
  label: string; // full row label for the table
  short: string; // compact label for the legend
  pct: number; // share of total OpEx (incl. PITI)
  amount: number; // $/mo
  color: string;
}

// Default OpEx mix per Mock 3A. Percentages are shares of TOTAL monthly
// operating cost INCLUDING PITI (debt service), which is why they sum to 100.
export const OPEX_DEFAULT_PCTS = {
  piti: 52,
  propTax: 12,
  mgmt: 10,
  maint: 8,
  insurance: 8,
  vacancy: 5,
  capex: 5,
} as const;

const OPEX_COLORS: Record<string, string> = {
  piti: "#126D85",
  propTax: "#5fd4e7",
  vacancy: "#7be3f0",
  mgmt: "#f5c948",
  maint: "#fb923c",
  insurance: "#4ade80",
  capex: "#a78bfa",
};

/**
 * OpEx breakdown for the doughnut + table. `total` is the monthly all-in cost
 * (PITI + reserves + tax + insurance). Each slice's $ amount is `total × pct`,
 * keeping the chart and table internally consistent with the documented mix.
 * Order matches the legend in the mock.
 */
export function opexBreakdown(r: HoldResults): {
  total: number;
  slices: OpExSlice[];
} {
  const total = r.piti + r.reservesTotal;
  const rows: { key: string; label: string; short: string; pct: number }[] = [
    { key: "piti", label: "PITI", short: "PITI", pct: OPEX_DEFAULT_PCTS.piti },
    { key: "propTax", label: "Property taxes", short: "Prop tax", pct: OPEX_DEFAULT_PCTS.propTax },
    { key: "vacancy", label: "Vacancy reserve", short: "Vacancy", pct: OPEX_DEFAULT_PCTS.vacancy },
    { key: "mgmt", label: "Property mgmt", short: "Mgmt", pct: OPEX_DEFAULT_PCTS.mgmt },
    { key: "maint", label: "Maintenance", short: "Maint.", pct: OPEX_DEFAULT_PCTS.maint },
    { key: "insurance", label: "Insurance", short: "Insurance", pct: OPEX_DEFAULT_PCTS.insurance },
    { key: "capex", label: "CapEx reserve", short: "CapEx", pct: OPEX_DEFAULT_PCTS.capex },
  ];
  const slices = rows.map((row) => ({
    key: row.key,
    label: row.label,
    short: row.short,
    pct: row.pct,
    amount: Math.round((total * row.pct) / 100),
    color: OPEX_COLORS[row.key],
  }));
  return { total: Math.round(total), slices };
}

// --- BRRRR feasibility ------------------------------------------------------

export type BrrrrVerdict = "all-in" | "partial" | "typical";

export interface BrrrrResult {
  purchase: number;
  rehab: number;
  closing: number;
  totalCost: number;
  rent: number;
  arv: number; // after-repair value
  refiLoan: number; // 75% LTV on ARV
  currentLoan: number; // assumed existing loan balance
  cashOut: number; // refi loan − current loan
  equityLeftInDeal: number; // total cost − cash out
  equityPctOfCost: number;
  verdict: BrrrrVerdict;
}

export const BRRRR_REFI_LTV = 0.75;
// TODO(brrrr-arv): refine ARV with real comp-derived value (RentCast /avm or
// comp percentile) in a follow-up PR. For v1 we use a flat post-rehab uplift.
export const BRRRR_ARV_UPLIFT = 1.1; // ARV = purchase × 1.1
export const BRRRR_CLOSING_PCT = 0.05; // closing ≈ 5% of purchase

/**
 * BRRRR (Buy, Rehab, Rent, Refinance) capital-recycling feasibility.
 *   totalCost      = purchase + rehab + closing (5% of purchase)
 *   ARV            = purchase × 1.1 (flat uplift — see TODO above)
 *   refiLoan       = ARV × 0.75
 *   currentLoan    = original purchase loan (purchase × (1 − downPct))
 *   cashOut        = refiLoan − currentLoan
 *   equityLeft     = totalCost − cashOut
 *   verdict        all-in   (equity ≤ 0)
 *                  partial  (0 < equity ≤ 20% of total cost)
 *                  typical  (equity > 20% of total cost)
 */
export function computeBrrrr(input: HoldInputs): BrrrrResult {
  const purchase = input.purchasePrice;
  const rehab = input.rehab;
  const closing = purchase * BRRRR_CLOSING_PCT;
  const totalCost = purchase + rehab + closing;
  const arv = purchase * BRRRR_ARV_UPLIFT;
  const refiLoan = arv * BRRRR_REFI_LTV;
  const currentLoan = purchase * (1 - pct(input.downPct));
  const cashOut = refiLoan - currentLoan;
  const equityLeftInDeal = totalCost - cashOut;
  const equityPctOfCost = totalCost > 0 ? (equityLeftInDeal / totalCost) * 100 : 0;

  let verdict: BrrrrVerdict;
  if (equityLeftInDeal <= 0) verdict = "all-in";
  else if (equityPctOfCost <= 20) verdict = "partial";
  else verdict = "typical";

  return {
    purchase: Math.round(purchase),
    rehab: Math.round(rehab),
    closing: Math.round(closing),
    totalCost: Math.round(totalCost),
    rent: Math.round(input.monthlyRent),
    arv: Math.round(arv),
    refiLoan: Math.round(refiLoan),
    currentLoan: Math.round(currentLoan),
    cashOut: Math.round(cashOut),
    equityLeftInDeal: Math.round(equityLeftInDeal),
    equityPctOfCost: Math.round(equityPctOfCost * 10) / 10,
    verdict,
  };
}

// Helper amortized payment re-export kept off — consumers import from holdCalc.
export { amortizedPayment };
