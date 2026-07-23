// Refresh-Deal orchestration (v1.7.0). Builds a full frozen snapshot payload by
// re-running the exact same data pipeline the interactive UI uses — comps,
// subject enrichment, rent AVM, rent-market trend, and site intelligence — via
// internal HTTP self-calls to the existing endpoints, then recomputes the Flip /
// Hold / BRRRR outputs with the LOCKED pure engines (calc.ts, holdCalc.ts,
// holdProjections.ts) imported directly. No engine math is modified here.
//
// On partial upstream failure each sub-call is caught: the succeeded fields are
// kept, the failed ones are nulled, and a human-readable warning is collected so
// the route can surface "Snapshot saved with N warnings".

import type { Request } from "express";
import type { Deal, DealInputs } from "@shared/schema";
import { dealInputsSchema, defaultDealInputs } from "@shared/schema";
import { normalizeBudget, budgetGrandTotal, categorySubtotal, BUDGET_CATEGORIES } from "@shared/budgetTemplate";
import type {
  SnapshotPayload,
  SnapshotSubject,
  SnapshotSite,
  SnapshotSaleComp,
  SnapshotRentComp,
  SnapshotArv,
  SnapshotRentAvm,
  SnapshotFlip,
  SnapshotHold,
  SnapshotBrrrr,
  SnapshotBudget,
} from "@shared/snapshot";
import { APP_VERSION } from "@shared/version";
import { calculateDeal } from "@/lib/calc";
import { calculateHold, type HoldInputs } from "@/lib/holdCalc";
import { computeBrrrr } from "@/lib/holdProjections";

function parseInputs(deal: Deal): DealInputs {
  try {
    const parsed = dealInputsSchema.safeParse(JSON.parse(deal.inputs));
    if (parsed.success) return { ...defaultDealInputs, ...parsed.data };
  } catch {
    /* fall through */
  }
  return { ...defaultDealInputs };
}

function originOf(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return process.env.PUBLIC_ORIGIN || `${proto}://${host}`;
}

async function getJson(url: string, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildBudgetSnapshot(deal: Deal): SnapshotBudget | null {
  let raw: unknown = null;
  if (deal.budget) {
    try {
      raw = JSON.parse(deal.budget);
    } catch {
      raw = null;
    }
  }
  if (raw == null) return null;
  const budget = normalizeBudget(raw);
  const subtotals: Record<string, number> = {};
  for (const cat of BUDGET_CATEGORIES) subtotals[cat.id] = categorySubtotal(budget, cat.id);
  return { grandTotal: budgetGrandTotal(budget), subtotals };
}

function flipSnapshot(inputs: DealInputs): SnapshotFlip {
  const r = calculateDeal(inputs);
  return {
    netProfit: Math.round(r.netProfit),
    roiOnCash: Math.round(r.roiOnCash * 10) / 10,
    annualizedRoi: Math.round(r.annualizedRoi * 10) / 10,
    profitMarginPct: Math.round(r.profitMarginPct * 10) / 10,
    totalProjectCost: Math.round(r.totalProjectCost),
    totalCashInvested: Math.round(r.totalCashInvested),
    maxAllowableOffer: Math.round(r.maxAllowableOffer),
    breakEvenArv: Math.round(r.breakEvenArv),
  };
}

// Synthesize the Hold underwriting from a Flip deal's inputs + the freshly
// fetched rent AVM. Server-side deals store no Hold state, so we use the wizard's
// documented defaults (25% down / 7% / 30yr, 5/8/5/5 reserves) and estimate tax +
// insurance the same way holdState.ts does.
function holdSnapshot(
  inputs: DealInputs,
  monthlyRent: number | null,
  annualPropertyTax: number | null,
  arv: number | null,
): SnapshotHold | null {
  if (monthlyRent == null || monthlyRent <= 0) return null;
  const hi: HoldInputs = {
    purchasePrice: inputs.purchasePrice,
    rehab: inputs.rehabBudget,
    monthlyRent,
    downPct: 25,
    ratePct: 7.0,
    termYears: 30,
    annualPropertyTax: annualPropertyTax ?? inputs.purchasePrice * 0.0105,
    annualInsurance: inputs.purchasePrice * 0.005,
    vacancyPct: 5,
    managementPct: 8,
    maintenancePct: 5,
    capexPct: 5,
    marketCapRatePct: null,
    valueEstimate: arv ?? null,
  };
  const r = calculateHold(hi);
  const annualRent = monthlyRent * 12;
  return {
    monthlyCashFlow: Math.round(r.monthlyCashFlow),
    annualCashFlow: Math.round(r.annualCashFlow),
    capRatePct: Math.round(r.capRatePct * 100) / 100,
    cashOnCashPct: Math.round(r.cashOnCashPct * 100) / 100,
    dscr: Math.round(r.dscr * 100) / 100,
    noi: Math.round(r.noi),
    longScore: r.longScore,
    shortScore: r.shortScore,
    monthlyRent: Math.round(monthlyRent),
    grossRentMultiplier:
      annualRent > 0 ? Math.round((inputs.purchasePrice / annualRent) * 100) / 100 : 0,
  };
}

function brrrrSnapshot(
  inputs: DealInputs,
  monthlyRent: number | null,
  arv: number | null,
  anchorPpsf: number | null,
): SnapshotBrrrr | null {
  if (monthlyRent == null || monthlyRent <= 0) return null;
  const hi: HoldInputs = {
    purchasePrice: inputs.purchasePrice,
    rehab: inputs.rehabBudget,
    monthlyRent,
    downPct: 25,
    ratePct: 7.0,
    termYears: 30,
    annualPropertyTax: inputs.purchasePrice * 0.0105,
    annualInsurance: inputs.purchasePrice * 0.005,
    vacancyPct: 5,
    managementPct: 8,
    maintenancePct: 5,
    capexPct: 5,
    marketCapRatePct: null,
    valueEstimate: arv ?? null,
  };
  const r = computeBrrrr(hi, { arv: arv ?? null, anchorPpsf: anchorPpsf ?? null });
  return {
    arv: r.arv,
    refiLoan: r.refiLoan,
    cashOut: r.cashOut,
    equityLeftInDeal: r.equityLeftInDeal,
    equityPctOfCost: r.equityPctOfCost,
    verdict: r.verdict,
  };
}

/**
 * Build the "original" backfill payload from CURRENT stored deal state only — no
 * API re-run. Freezes inputs, the stored ARV, the Flip result, and the budget.
 * Comps / rent / site / hold are null because we haven't burned any credits.
 */
export function buildBackfillPayload(deal: Deal): SnapshotPayload {
  const inputs = parseInputs(deal);
  const arv: SnapshotArv | null =
    inputs.arv > 0
      ? {
          value: Math.round(inputs.arv),
          low: Math.round(inputs.arv * 0.9),
          high: Math.round(inputs.arv * 1.1),
          band: 0.1,
          basis: "stored",
          method: "stored-input",
          anchorPpsf: null,
          compCount: 0,
          styleMatchCount: 0,
          radiusMiles: null,
          wideRadius: false,
        }
      : null;
  const subject: SnapshotSubject = {
    address: deal.address ?? null,
    sqft: deal.sqft ?? null,
    beds: deal.beds ?? null,
    baths: deal.baths ?? null,
    yearBuilt: deal.yearBuilt ?? null,
    style: null,
    heatingType: null,
    coolingType: null,
    hasPool: null,
    water: null,
    sewer: null,
    waterSewerLabel: null,
    lotSqft: inputs.lotSqft ?? null,
    lotAcres: inputs.lotAcres ?? null,
  };
  return {
    appVersion: APP_VERSION,
    subject,
    site: null,
    saleComps: [],
    rentComps: [],
    rentAvm: null,
    arv,
    flip: flipSnapshot(inputs),
    hold: null,
    brrrr: null,
    budget: buildBudgetSnapshot(deal),
    inputs,
    warnings: [],
  };
}

/**
 * Full refresh: re-run comps + enrichment + rent + site intel via internal
 * self-calls, recompute scores, and assemble the frozen payload. Every upstream
 * failure degrades gracefully (field nulled + warning collected).
 */
export async function buildRefreshPayload(req: Request, deal: Deal): Promise<SnapshotPayload> {
  const inputs = parseInputs(deal);
  const origin = originOf(req);
  const warnings: string[] = [];

  const targetSqft = inputs.finalSqft && inputs.finalSqft > 0 ? inputs.finalSqft : deal.sqft ?? null;
  const targetBeds = inputs.finalBeds && inputs.finalBeds > 0 ? inputs.finalBeds : null;
  const targetBaths = inputs.finalBaths && inputs.finalBaths > 0 ? inputs.finalBaths : null;

  // ---- Sale comps + subject enrichment + unified ARV ----
  let saleComps: SnapshotSaleComp[] = [];
  let arv: SnapshotArv | null = null;
  let subjectEnrich: any = null;
  {
    const p = new URLSearchParams({ address: deal.address });
    if (targetSqft) p.set("targetSqft", String(targetSqft));
    if (targetBeds) p.set("targetBeds", String(targetBeds));
    if (targetBaths) p.set("targetBaths", String(targetBaths));
    try {
      const data = await getJson(`${origin}/api/comps?${p.toString()}`);
      subjectEnrich = data.subject ?? null;
      saleComps = (data.comps ?? []).map(
        (c: any): SnapshotSaleComp => ({
          id: String(c.id ?? ""),
          address: String(c.address ?? ""),
          price: num(c.price) ?? 0,
          sqft: num(c.sqft),
          beds: num(c.beds),
          baths: num(c.baths),
          yearBuilt: num(c.yearBuilt),
          distance: num(c.distance) ?? 0,
          daysOld: num(c.daysOld) ?? 0,
          pricePerSqft: num(c.pricePerSqft),
          style: c.style ?? null,
          styleMatch: !!c.styleMatch,
          waterSewerLabel: c.waterSewerLabel ?? null,
        }),
      );
      if (data.arv != null) {
        arv = {
          value: num(data.arv) ?? 0,
          low: num(data.arvLow) ?? 0,
          high: num(data.arvHigh) ?? 0,
          band: data.quality?.level === "wide" || (num(data.compCount) ?? 0) < 6 ? 0.1 : 0.07,
          basis: String(data.arvBasis ?? "top-price"),
          method: String(data.arvMethod ?? "top4-by-price-mean-ppsf"),
          anchorPpsf: num(data.arvAnchorPpsf),
          compCount: num(data.compCount) ?? saleComps.length,
          styleMatchCount: num(data.styleMatchCount) ?? 0,
          radiusMiles: num(data.radiusMiles),
          wideRadius: data.quality?.level === "wide",
        };
      }
    } catch (e) {
      warnings.push("Sale comps unavailable");
    }
  }

  // ---- Rent AVM + rent comps ----
  let rentAvm: SnapshotRentAvm | null = null;
  let rentComps: SnapshotRentComp[] = [];
  let monthlyRent: number | null = null;
  {
    try {
      const data = await getJson(
        `${origin}/api/rent-comps?address=${encodeURIComponent(deal.address)}`,
      );
      monthlyRent = num(data.median);
      rentAvm = {
        median: monthlyRent,
        rentLow: num(data.rentLow),
        rentHigh: num(data.rentHigh),
        compCount: num(data.compCount) ?? 0,
        marketYoyChange: null,
      };
      rentComps = (data.comps ?? []).map(
        (c: any): SnapshotRentComp => ({
          id: String(c.id ?? ""),
          address: String(c.address ?? ""),
          rent: num(c.rent) ?? 0,
          sqft: num(c.sqft),
          beds: num(c.beds),
          baths: num(c.baths),
          distance: num(c.distance) ?? 0,
        }),
      );
    } catch (e) {
      warnings.push("Rent comps unavailable");
    }
  }

  // ---- Rent market YoY (best-effort, folds into rentAvm) ----
  if (deal.zip && /^\d{5}$/.test(deal.zip)) {
    try {
      const data = await getJson(`${origin}/api/rent-market?zip=${deal.zip}`);
      if (data?.available && rentAvm) rentAvm.marketYoyChange = num(data.yoyChange);
    } catch {
      /* non-fatal, no warning — market trend is supplemental */
    }
  }

  // ---- Site intelligence ----
  let site: SnapshotSite | null = null;
  if (deal.lat != null && deal.lon != null) {
    try {
      const data = await getJson(
        `${origin}/api/site-intelligence?lat=${deal.lat}&lon=${deal.lon}`,
      );
      const panel = (x: any) =>
        x ? { state: x.state ?? null, label: x.label ?? null, meta: x.meta ?? null } : null;
      site = {
        criticalArea: panel(data.criticalArea),
        highSchool: panel(data.highSchool),
        water: panel(data.water),
        sewer: panel(data.sewer),
      };
    } catch (e) {
      warnings.push("Site intelligence unavailable");
    }
  }

  // ---- Subject facts (property/full) ----
  let annualPropertyTax: number | null = null;
  const subject: SnapshotSubject = {
    address: subjectEnrich?.address ?? deal.address ?? null,
    sqft: deal.sqft ?? null,
    beds: deal.beds ?? null,
    baths: deal.baths ?? null,
    yearBuilt: deal.yearBuilt ?? null,
    style: subjectEnrich?.style ?? null,
    heatingType: subjectEnrich?.heatingType ?? null,
    coolingType: subjectEnrich?.coolingType ?? null,
    hasPool: subjectEnrich?.hasPool ?? null,
    water: subjectEnrich?.water ?? null,
    sewer: subjectEnrich?.sewer ?? null,
    waterSewerLabel: subjectEnrich?.waterSewerLabel ?? null,
    lotSqft: inputs.lotSqft ?? null,
    lotAcres: inputs.lotAcres ?? null,
  };
  {
    try {
      const data = await getJson(
        `${origin}/api/property/full?address=${encodeURIComponent(deal.address)}${
          deal.zip ? `&zip=${deal.zip}` : ""
        }`,
      );
      if (data?.facts) {
        subject.sqft = num(data.facts.sqft) ?? subject.sqft;
        subject.beds = num(data.facts.beds) ?? subject.beds;
        subject.baths = num(data.facts.baths) ?? subject.baths;
        subject.yearBuilt = num(data.facts.yearBuilt) ?? subject.yearBuilt;
        subject.lotSqft = num(data.facts.lotSqft) ?? subject.lotSqft;
        subject.lotAcres = num(data.facts.lotAcres) ?? subject.lotAcres;
      }
      annualPropertyTax = num(data?.taxes?.latestTaxAmount);
    } catch {
      /* non-fatal — subject facts fall back to stored deal columns */
    }
  }

  // ---- Recompute Flip with the FRESH ARV so profit reflects new comps ----
  const flipInputs: DealInputs = { ...inputs };
  if (arv?.value) flipInputs.arv = arv.value;
  const flip = flipSnapshot(flipInputs);

  const hold = holdSnapshot(flipInputs, monthlyRent, annualPropertyTax, arv?.value ?? null);
  const brrrr = brrrrSnapshot(flipInputs, monthlyRent, arv?.value ?? null, arv?.anchorPpsf ?? null);

  return {
    appVersion: APP_VERSION,
    subject,
    site,
    saleComps,
    rentComps,
    rentAvm,
    arv,
    flip,
    hold,
    brrrr,
    budget: buildBudgetSnapshot(deal),
    inputs: flipInputs,
    warnings,
  };
}
