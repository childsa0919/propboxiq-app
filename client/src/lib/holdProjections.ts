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
import { computeArvFromComps } from "@shared/arv";

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

// Keys for the editable (non-PITI) operating-cost rows. PITI is derived from
// loan terms and is NOT user-adjustable here.
export type OpExEditableKey =
  | "propTax"
  | "insurance"
  | "vacancy"
  | "mgmt"
  | "maint"
  | "capex";

// User overrides as decimal shares of total monthly OpEx (e.g. 0.012 = 1.2%).
export type OpExOverrideMap = Partial<Record<OpExEditableKey, number>>;

const OPEX_COLORS: Record<string, string> = {
  piti: "#126D85",
  propTax: "#5fd4e7",
  vacancy: "#7be3f0",
  mgmt: "#f5c948",
  maint: "#fb923c",
  insurance: "#4ade80",
  capex: "#a78bfa",
};

const OPEX_ROW_META: { key: string; label: string; short: string; editable: boolean }[] = [
  { key: "piti", label: "PITI", short: "PITI", editable: false },
  { key: "propTax", label: "Property taxes", short: "Prop tax", editable: true },
  { key: "vacancy", label: "Vacancy reserve", short: "Vacancy", editable: true },
  { key: "mgmt", label: "Property mgmt", short: "Mgmt", editable: true },
  { key: "maint", label: "Maintenance", short: "Maint.", editable: true },
  { key: "insurance", label: "Insurance", short: "Insurance", editable: true },
  { key: "capex", label: "CapEx reserve", short: "CapEx", editable: true },
];

/**
 * Apply OpEx overrides to the engine inputs. Each override is a decimal share
 * of the BASE (unedited) total monthly OpEx; we convert that target $ back into
 * the engine's native inputs:
 *   • propTax / insurance → annual $ (×12)
 *   • vacancy / mgmt / maint / capex → % of gross monthly rent
 * PITI (P&I) is never touched — only operating costs are editable. Returns a
 * new HoldInputs; the original is unmodified.
 */
export function applyOpExOverrides(
  input: HoldInputs,
  base: HoldResults,
  overrides: OpExOverrideMap | undefined,
): HoldInputs {
  if (!overrides || Object.keys(overrides).length === 0) return input;
  const baseTotal = base.piti + base.reservesTotal;
  const rent = input.monthlyRent;
  const next: HoldInputs = { ...input };

  const targetDollar = (share: number) => Math.max(0, share) * baseTotal;

  if (overrides.propTax != null) {
    next.annualPropertyTax = targetDollar(overrides.propTax) * 12;
  }
  if (overrides.insurance != null) {
    next.annualInsurance = targetDollar(overrides.insurance) * 12;
  }
  // Reserve rows are % of gross rent. When rent is 0 we can't express a $ as a
  // %, so leave the reserve untouched (the override has no usable target).
  if (rent > 0) {
    if (overrides.vacancy != null) {
      next.vacancyPct = (targetDollar(overrides.vacancy) / rent) * 100;
    }
    if (overrides.mgmt != null) {
      next.managementPct = (targetDollar(overrides.mgmt) / rent) * 100;
    }
    if (overrides.maint != null) {
      next.maintenancePct = (targetDollar(overrides.maint) / rent) * 100;
    }
    if (overrides.capex != null) {
      next.capexPct = (targetDollar(overrides.capex) / rent) * 100;
    }
  }
  return next;
}

/**
 * OpEx breakdown for the doughnut + table, derived from the REAL engine results
 * `r` (no fixed default percentages). Each row's $ is the actual monthly figure
 * the engine computed; the % is that row's share of the all-in monthly total
 * (P&I + tax + insurance + reserves). PITI here is the debt-service slice (P&I)
 * — tax + insurance are broken out as their own rows. Order matches the mock.
 */
export function opexBreakdown(r: HoldResults): {
  total: number;
  slices: OpExSlice[];
} {
  const amounts: Record<string, number> = {
    piti: r.monthlyPI,
    propTax: r.monthlyTax,
    insurance: r.monthlyInsurance,
    vacancy: r.vacancy,
    mgmt: r.management,
    maint: r.maintenance,
    capex: r.capex,
  };
  const total = Object.values(amounts).reduce((a, b) => a + b, 0);
  const slices: OpExSlice[] = OPEX_ROW_META.map((row) => {
    const amount = amounts[row.key] ?? 0;
    return {
      key: row.key,
      label: row.label,
      short: row.short,
      pct: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      amount: Math.round(amount),
      color: OPEX_COLORS[row.key],
    };
  });
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
  arvSource: ArvSource; // how ARV was derived (comps vs flat estimate)
}

export const BRRRR_REFI_LTV = 0.75;
// Flat post-rehab uplift used only when comp data is unavailable.
export const BRRRR_ARV_UPLIFT = 1.1; // ARV = purchase × 1.1
// Minimum usable comps before we trust a comp-derived ARV over the flat uplift.
export const BRRRR_MIN_COMPS = 3;
export const BRRRR_CLOSING_PCT = 0.05; // closing ≈ 5% of purchase

/** Minimal sale-comp shape needed to derive ARV via the unified formula. */
export interface SaleComp {
  id?: string;
  price: number;
  pricePerSqft: number | null;
}

/** How the ARV in a BrrrrResult was derived. */
export type ArvSource =
  | { kind: "comps"; compCount: number; anchorPpsf: number }
  | { kind: "estimate" };

/**
 * BRRRR (Buy, Rehab, Rent, Refinance) capital-recycling feasibility.
 *   totalCost      = purchase + rehab + closing (5% of purchase)
 *   ARV            = the UNIFIED comp ARV (same top-4-by-price × mean $/sqft math
 *                    as the Flip result — see shared/arv.ts). When the server has
 *                    already computed it (`opts.arv`), we use that exact value so
 *                    BRRRR and Flip can never disagree. Otherwise we recompute it
 *                    locally from the comp list via the same shared function.
 *                    Falls back to purchase × 1.1 when no comps are available.
 *   refiLoan       = ARV × 0.75
 *   currentLoan    = original purchase loan (purchase × (1 − downPct))
 *   cashOut        = refiLoan − currentLoan
 *   equityLeft     = totalCost − cashOut
 *   verdict        all-in   (equity ≤ 0)
 *                  partial  (0 < equity ≤ 20% of total cost)
 *                  typical  (equity > 20% of total cost)
 */
export function computeBrrrr(
  input: HoldInputs,
  opts?: {
    comps?: SaleComp[];
    subjectSqft?: number | null;
    /** Server-computed unified ARV (from /api/comps). Preferred when present. */
    arv?: number | null;
    anchorPpsf?: number | null;
  },
): BrrrrResult {
  const purchase = input.purchasePrice;
  const rehab = input.rehab;
  const closing = purchase * BRRRR_CLOSING_PCT;
  const totalCost = purchase + rehab + closing;

  const comps = opts?.comps ?? [];
  const usablePpsf = comps.filter(
    (c) => c.pricePerSqft != null && Number.isFinite(c.pricePerSqft) && c.pricePerSqft > 0,
  );
  const subjectSqft = opts?.subjectSqft ?? null;
  let arv: number;
  let arvSource: ArvSource;
  if (opts?.arv != null && opts.arv > 0) {
    // Use the exact ARV the Flip result computed on the server.
    arv = opts.arv;
    arvSource = {
      kind: "comps",
      compCount: comps.length,
      anchorPpsf: Math.round(opts.anchorPpsf ?? 0),
    };
  } else if (usablePpsf.length >= BRRRR_MIN_COMPS && subjectSqft && subjectSqft > 0) {
    // Recompute locally with the SAME shared formula the server uses.
    const r = computeArvFromComps(comps, subjectSqft, comps.length);
    arv = r.arv;
    arvSource = {
      kind: "comps",
      compCount: usablePpsf.length,
      anchorPpsf: Math.round(r.anchorPpsf ?? 0),
    };
  } else {
    arv = purchase * BRRRR_ARV_UPLIFT;
    arvSource = { kind: "estimate" };
  }

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
    arvSource,
  };
}

// Helper amortized payment re-export kept off — consumers import from holdCalc.
export { amortizedPayment };
