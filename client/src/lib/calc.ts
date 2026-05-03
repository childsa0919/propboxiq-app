// Flip deal calculation engine.
// All inputs in dollars (or % where noted). Pure functions — fully testable.

import type { DealInputs } from "@shared/schema";
import { computeClosingCosts, type ClosingCostBreakdown } from "./closingCosts";

export interface LocaleHint {
  state?: string | null;
  city?: string | null;
}

export interface DealResults {
  // Cost basis
  rehabContingency: number;
  totalRehab: number;
  buyClosing: number;
  // Financing
  loanAmount: number;
  cashDownAtPurchase: number; // out-of-pocket on day 1
  loanPoints: number;
  interestCost: number;
  totalFinancingCost: number;
  // Holding
  totalHoldingCost: number;
  // Sale
  sellClosing: number;
  agentCommission: number;
  totalSellCosts: number;
  // Roll-up
  totalProjectCost: number; // everything that comes out of the deal
  totalCashInvested: number; // your actual cash exposure
  netProfit: number;
  roiOnCash: number; // % — profit / cash invested
  roiOnCost: number; // % — profit / total project cost
  annualizedRoi: number; // % — ROI on cash, annualized over hold
  profitMarginPct: number; // profit / ARV
  // Decision metrics
  maxAllowableOffer: number; // 70%-rule style, given desired profit & costs
  breakEvenArv: number; // ARV at which profit = 0
}

const pct = (n: number) => (n || 0) / 100;

export function calculateDeal(i: DealInputs, locale?: LocaleHint): DealResults & { closingCosts?: ClosingCostBreakdown } {
  const rehabContingency = i.rehabBudget * pct(i.rehabContingencyPct);
  const totalRehab = i.rehabBudget + rehabContingency;

  // Financing: hard money sized as % of loan-to-cost (purchase + rehab).
  // isCashPurchase short-circuits to all-cash regardless of financingType
  // (Quick wizard toggle; detailed mode still uses financingType).
  const isCash = i.isCashPurchase === true || i.financingType === "cash";
  const ltcBasis = i.purchasePrice + totalRehab;
  const loanAmount = isCash ? 0 : ltcBasis * pct(i.loanLtcPct);

  // Locale-aware closing costs (when state provided), else fall back to flat %.
  const closingCosts = locale?.state
    ? computeClosingCosts(locale.state, i.purchasePrice, i.arv, loanAmount, locale.city)
    : undefined;
  const buyClosing = closingCosts ? closingCosts.buy.total : i.purchasePrice * pct(i.buyClosingPct);

  // Cash needed at acquisition: down payment portion of purchase + buy closing
  // (hard money typically funds purchase + rehab; we approximate the down
  //  as ltcBasis - loanAmount, treating rehab as later draws covered by the loan).
  const loanFeesEff = isCash ? 0 : i.loanFees;
  const cashDownAtPurchase = Math.max(0, ltcBasis - loanAmount) + buyClosing + loanFeesEff;

  const loanPoints = loanAmount * pct(i.loanPointsPct);
  // Simple interest for hold period; conservative assumption that the full loan
  // is outstanding for the full hold period (real draws grow over time).
  const interestCost =
    loanAmount * (pct(i.loanRatePct) / 12) * i.holdingMonths;
  const totalFinancingCost = loanPoints + interestCost + loanFeesEff;

  const totalHoldingCost = i.monthlyHoldingCosts * i.holdingMonths;

  const sellClosing = closingCosts ? closingCosts.sell.total : i.arv * pct(i.sellClosingPct);
  const agentCommission = i.arv * pct(i.agentCommissionPct);
  const totalSellCosts = sellClosing + agentCommission;

  const totalProjectCost =
    i.purchasePrice +
    totalRehab +
    buyClosing +
    totalFinancingCost +
    totalHoldingCost +
    totalSellCosts;

  // Total cash invested: cash down + financing fees + rehab not covered by loan + holding
  // Rehab covered by loan reduces cash, so:
  const rehabFinancedByLoan = Math.min(loanAmount, ltcBasis) - Math.max(0, i.purchasePrice - loanAmount);
  // Simpler & robust: cash invested = total project cost - loanAmount (loan eventually repaid out of sale)
  const totalCashInvested = Math.max(0, totalProjectCost - loanAmount);

  const netProfit = i.arv - totalProjectCost;
  const roiOnCash =
    totalCashInvested > 0 ? (netProfit / totalCashInvested) * 100 : 0;
  const roiOnCost =
    totalProjectCost > 0 ? (netProfit / totalProjectCost) * 100 : 0;
  const annualizedRoi =
    i.holdingMonths > 0 ? roiOnCash * (12 / i.holdingMonths) : roiOnCash;
  const profitMarginPct = i.arv > 0 ? (netProfit / i.arv) * 100 : 0;

  // MAO: max purchase price such that profit >= ARV * desiredProfitPct.
  // Closed-form: profit(P) is linear in P (P feeds rehab=fixed, buyClosing scales with P,
  // loanAmount scales with P which feeds points & interest). Solve algebraically.
  const desiredProfit = i.arv * pct(i.desiredProfitPct);
  const mao = computeMao(i, desiredProfit);

  // Break-even ARV at current purchase price: ARV s.t. profit = 0
  // = totalProjectCost when ARV-dependent costs (sell closing + commission) are factored
  // ARV - totalCostsAtArv = 0  →  ARV (1 - sellPct - commPct) = nonArvCosts
  const arvCostsRate = pct(i.sellClosingPct) + pct(i.agentCommissionPct);
  const nonArvCosts =
    i.purchasePrice +
    totalRehab +
    buyClosing +
    totalFinancingCost +
    totalHoldingCost;
  const breakEvenArv =
    arvCostsRate < 1 ? nonArvCosts / (1 - arvCostsRate) : 0;

  return {
    rehabContingency,
    totalRehab,
    buyClosing,
    loanAmount,
    cashDownAtPurchase,
    loanPoints,
    interestCost,
    totalFinancingCost,
    totalHoldingCost,
    sellClosing,
    agentCommission,
    totalSellCosts,
    totalProjectCost,
    totalCashInvested,
    netProfit,
    roiOnCash,
    roiOnCost,
    annualizedRoi,
    profitMarginPct,
    maxAllowableOffer: mao,
    breakEvenArv,
    closingCosts,
            // unused but available
            // @ts-ignore
            _rehabFinancedByLoan: rehabFinancedByLoan,
  } as DealResults & { closingCosts?: ClosingCostBreakdown };
}

// Compute profit as a linear function of purchase price P, then solve for P.
// profit(P) = ARV - totalProjectCost(P)
// totalProjectCost(P) = P + totalRehab + buyClosing(P) + financingCost(P) + holding + sellCosts
// where:
//   buyClosing(P)    = P * buyClosingPct
//   loanAmount(P)    = (P + totalRehab) * loanLtcPct  (if hard money else 0)
//   loanPoints(P)    = loanAmount(P) * loanPointsPct
//   loanInterest(P)  = loanAmount(P) * (rate/12) * months
//   loanFees         = constant
// So everything is linear in P. Compute slope a and intercept b: cost(P) = a*P + b.
function computeMao(i: DealInputs, desiredProfit: number): number {
  const rehabContingency = i.rehabBudget * pct(i.rehabContingencyPct);
  const totalRehab = i.rehabBudget + rehabContingency;
  const sellClosing = i.arv * pct(i.sellClosingPct);
  const agentCommission = i.arv * pct(i.agentCommissionPct);
  const totalSellCosts = sellClosing + agentCommission;
  const totalHoldingCost = i.monthlyHoldingCosts * i.holdingMonths;

  const isCash = i.isCashPurchase === true || i.financingType === "cash";
  const ltcRate = isCash ? 0 : pct(i.loanLtcPct);
  const interestRateOverHold = pct(i.loanRatePct) / 12 * i.holdingMonths;
  const loanCostMultiplier = pct(i.loanPointsPct) + interestRateOverHold;
  const loanFeesEff = isCash ? 0 : i.loanFees;

  // financingCost(P) = ltcRate*(P + totalRehab) * loanCostMultiplier + loanFees
  // slope: ltcRate * loanCostMultiplier; intercept: ltcRate*totalRehab*loanCostMultiplier + loanFees
  const finSlope = ltcRate * loanCostMultiplier;
  const finIntercept = ltcRate * totalRehab * loanCostMultiplier + loanFeesEff;

  // cost(P) = P*(1 + buyClosingPct + finSlope) + (totalRehab + totalHoldingCost + totalSellCosts + finIntercept)
  const a = 1 + pct(i.buyClosingPct) + finSlope;
  const b = totalRehab + totalHoldingCost + totalSellCosts + finIntercept;

  // profit(P) = ARV - a*P - b >= desiredProfit  =>  P <= (ARV - desiredProfit - b) / a
  if (a <= 0) return 0;
  const mao = (i.arv - desiredProfit - b) / a;
  return Math.max(0, mao);
}

export const fmtUSD = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "$0";

export const fmtPct = (n: number, digits = 1) =>
  Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";

export const fmtNum = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "—";
