// Snapshot payload + diff model — the single source of truth for the shape of a
// frozen point-in-time deal snapshot (v1.7.0 "Refresh Deal") and the structured
// diffs the Snapshot History + Compare view render. Shared by client and server
// so a snapshot written on the server deserializes to the same type the UI reads.
//
// A snapshot's `payload` freezes EVERYTHING that can change when a deal is
// refreshed: subject property facts, site intelligence, sale + rent comps, the
// unified ARV, the Flip / Hold / BRRRR outputs, the Walkthrough Budget totals,
// and the deal inputs used to compute them. It deliberately excludes PII,
// auth/session data, and unrelated timestamps.

import type { DealInputs } from "./schema";

// ---------- Frozen sub-shapes ----------

export interface SnapshotSubject {
  address: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  yearBuilt: number | null;
  style: string | null;
  heatingType: string | null;
  coolingType: string | null;
  hasPool: boolean | null;
  water: string | null;
  sewer: string | null;
  waterSewerLabel: string | null;
  lotSqft: number | null;
  lotAcres: number | null;
}

export interface SnapshotSitePanel {
  state: string | null;
  label: string | null;
  meta: string | null;
}

export interface SnapshotSite {
  criticalArea: SnapshotSitePanel | null;
  highSchool: SnapshotSitePanel | null;
  water: SnapshotSitePanel | null;
  sewer: SnapshotSitePanel | null;
}

export interface SnapshotSaleComp {
  id: string;
  address: string;
  price: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  yearBuilt: number | null;
  distance: number;
  daysOld: number;
  pricePerSqft: number | null;
  style: string | null;
  styleMatch: boolean;
  waterSewerLabel: string | null;
}

export interface SnapshotRentComp {
  id: string;
  address: string;
  rent: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  distance: number;
}

export interface SnapshotArv {
  value: number;
  low: number;
  high: number;
  band: number;
  basis: string; // "style-matched" | "top-price"
  method: string;
  anchorPpsf: number | null;
  compCount: number;
  styleMatchCount: number;
  radiusMiles: number | null;
  wideRadius: boolean;
}

export interface SnapshotRentAvm {
  median: number | null;
  rentLow: number | null;
  rentHigh: number | null;
  compCount: number;
  marketYoyChange: number | null;
}

// Flip engine outputs we freeze (subset of DealResults that the UI surfaces).
export interface SnapshotFlip {
  netProfit: number;
  roiOnCash: number;
  annualizedRoi: number;
  profitMarginPct: number;
  totalProjectCost: number;
  totalCashInvested: number;
  maxAllowableOffer: number;
  breakEvenArv: number;
}

// Hold engine outputs we freeze (subset of HoldResults).
export interface SnapshotHold {
  monthlyCashFlow: number;
  annualCashFlow: number;
  capRatePct: number;
  cashOnCashPct: number;
  dscr: number;
  noi: number;
  longScore: number;
  shortScore: number;
  monthlyRent: number;
  grossRentMultiplier: number; // price / annual rent
}

export interface SnapshotBrrrr {
  arv: number;
  refiLoan: number;
  cashOut: number;
  equityLeftInDeal: number;
  equityPctOfCost: number;
  verdict: string;
}

export interface SnapshotBudget {
  grandTotal: number;
  subtotals: Record<string, number>;
}

export interface SnapshotPayload {
  appVersion: string;
  subject: SnapshotSubject;
  site: SnapshotSite | null;
  saleComps: SnapshotSaleComp[];
  rentComps: SnapshotRentComp[];
  rentAvm: SnapshotRentAvm | null;
  arv: SnapshotArv | null;
  flip: SnapshotFlip | null;
  hold: SnapshotHold | null;
  brrrr: SnapshotBrrrr | null;
  budget: SnapshotBudget | null;
  inputs: DealInputs;
  warnings: string[];
}

// ---------- Diff model ----------

export type MetricFormat = "money" | "percent" | "count" | "bps" | "ratio";
export type Direction = "up" | "down" | "flat";
export type BetterWhen = "higher" | "lower" | "neutral";

export interface MetricDelta {
  key: string;
  label: string;
  format: MetricFormat;
  before: number | null;
  after: number | null;
  delta: number | null; // after - before
  pctChange: number | null; // (after - before) / |before| * 100
  direction: Direction;
}

/** Precomputed change summary saved alongside each refreshed snapshot. */
export interface ChangeSummary {
  metrics: MetricDelta[];
  /** Count of metrics that actually moved (direction !== "flat"). */
  changeCount: number;
}

export interface CompareRow extends MetricDelta {
  section: string;
  betterWhen: BetterWhen;
  /** improved / regressed / neutral — derived from direction + betterWhen. */
  outcome: "improved" | "regressed" | "neutral";
}

export interface CompareSection {
  name: string;
  rows: CompareRow[];
}

export interface CompareResult {
  sections: CompareSection[];
  summary: {
    improved: number;
    regressed: number;
    unchanged: number;
    trend: "UP" | "DOWN" | "FLAT";
  };
}

// ---------- Diff helpers ----------

const EPS = 1e-6;

function makeDelta(
  key: string,
  label: string,
  format: MetricFormat,
  before: number | null,
  after: number | null,
): MetricDelta {
  const bothNum = before != null && after != null;
  const delta = bothNum ? after! - before! : null;
  const pctChange =
    bothNum && Math.abs(before!) > EPS ? ((after! - before!) / Math.abs(before!)) * 100 : null;
  let direction: Direction = "flat";
  if (delta != null && Math.abs(delta) > EPS) direction = delta > 0 ? "up" : "down";
  return { key, label, format, before, after, delta, pctChange, direction };
}

// Headline metrics for the per-refresh change summary (spec: ARV, rent, profit,
// cap rate, DSCR, comp count).
export function computeChangeSummary(
  prev: SnapshotPayload | null,
  next: SnapshotPayload,
): ChangeSummary {
  const g = <T,>(p: SnapshotPayload | null, f: (p: SnapshotPayload) => T | null | undefined): T | null =>
    p ? (f(p) ?? null) : null;

  const metrics: MetricDelta[] = [
    makeDelta("arv", "ARV", "money", g(prev, (p) => p.arv?.value), next.arv?.value ?? null),
    makeDelta(
      "rent",
      "Market rent",
      "money",
      g(prev, (p) => p.rentAvm?.median),
      next.rentAvm?.median ?? null,
    ),
    makeDelta("profit", "Projected profit", "money", g(prev, (p) => p.flip?.netProfit), next.flip?.netProfit ?? null),
    makeDelta("capRate", "Cap rate", "percent", g(prev, (p) => p.hold?.capRatePct), next.hold?.capRatePct ?? null),
    makeDelta("dscr", "DSCR", "ratio", g(prev, (p) => p.hold?.dscr), next.hold?.dscr ?? null),
    makeDelta("compCount", "Comp count", "count", g(prev, (p) => p.arv?.compCount), next.arv?.compCount ?? null),
  ];
  const changeCount = metrics.filter((m) => m.direction !== "flat").length;
  return { metrics, changeCount };
}

interface RowSpec {
  key: string;
  label: string;
  section: string;
  format: MetricFormat;
  betterWhen: BetterWhen;
  pick: (p: SnapshotPayload) => number | null | undefined;
}

const COMPARE_SPECS: RowSpec[] = [
  // Deal Metrics
  { key: "arv", label: "ARV", section: "Deal Metrics", format: "money", betterWhen: "higher", pick: (p) => p.arv?.value },
  { key: "rent", label: "Market rent", section: "Deal Metrics", format: "money", betterWhen: "higher", pick: (p) => p.rentAvm?.median },
  { key: "profit", label: "Projected profit", section: "Deal Metrics", format: "money", betterWhen: "higher", pick: (p) => p.flip?.netProfit },
  { key: "roi", label: "ROI on cash", section: "Deal Metrics", format: "percent", betterWhen: "higher", pick: (p) => p.flip?.roiOnCash },
  { key: "capRate", label: "Cap rate", section: "Deal Metrics", format: "percent", betterWhen: "higher", pick: (p) => p.hold?.capRatePct },
  { key: "dscr", label: "DSCR", section: "Deal Metrics", format: "ratio", betterWhen: "higher", pick: (p) => p.hold?.dscr },
  { key: "cashFlow", label: "Cash flow (monthly)", section: "Deal Metrics", format: "money", betterWhen: "higher", pick: (p) => p.hold?.monthlyCashFlow },
  { key: "coc", label: "Cash-on-cash", section: "Deal Metrics", format: "percent", betterWhen: "higher", pick: (p) => p.hold?.cashOnCashPct },
  { key: "grm", label: "Gross rent multiplier", section: "Deal Metrics", format: "ratio", betterWhen: "lower", pick: (p) => p.hold?.grossRentMultiplier },
  // Comps
  { key: "compCount", label: "Comp count", section: "Comps", format: "count", betterWhen: "higher", pick: (p) => p.arv?.compCount },
  { key: "styleMatched", label: "Style-matched comps", section: "Comps", format: "count", betterWhen: "higher", pick: (p) => p.arv?.styleMatchCount },
  { key: "radius", label: "Comp radius (mi)", section: "Comps", format: "ratio", betterWhen: "lower", pick: (p) => p.arv?.radiusMiles },
  { key: "rentCompCount", label: "Rent comp count", section: "Comps", format: "count", betterWhen: "higher", pick: (p) => p.rentAvm?.compCount },
  // Budget
  { key: "rehab", label: "Rehab budget", section: "Budget", format: "money", betterWhen: "lower", pick: (p) => p.budget?.grandTotal ?? p.inputs?.rehabBudget },
  { key: "purchase", label: "Purchase price", section: "Budget", format: "money", betterWhen: "lower", pick: (p) => p.inputs?.purchasePrice },
];

function outcomeOf(direction: Direction, betterWhen: BetterWhen): "improved" | "regressed" | "neutral" {
  if (direction === "flat" || betterWhen === "neutral") return "neutral";
  if (betterWhen === "higher") return direction === "up" ? "improved" : "regressed";
  return direction === "down" ? "improved" : "regressed";
}

/** Build the structured Compare diff (baseline → current) from two payloads. */
export function computeCompare(baseline: SnapshotPayload, current: SnapshotPayload): CompareResult {
  const sectionOrder = ["Deal Metrics", "Comps", "Site Intelligence", "Budget"];
  const bySection = new Map<string, CompareRow[]>();
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;

  for (const spec of COMPARE_SPECS) {
    const before = spec.pick(baseline) ?? null;
    const after = spec.pick(current) ?? null;
    if (before == null && after == null) continue;
    const d = makeDelta(spec.key, spec.label, spec.format, before, after);
    const outcome = outcomeOf(d.direction, spec.betterWhen);
    if (outcome === "improved") improved++;
    else if (outcome === "regressed") regressed++;
    else unchanged++;
    const row: CompareRow = { ...d, section: spec.section, betterWhen: spec.betterWhen, outcome };
    if (!bySection.has(spec.section)) bySection.set(spec.section, []);
    bySection.get(spec.section)!.push(row);
  }

  // Site Intelligence — text rows compared for equality (changed vs unchanged).
  const siteRows: CompareRow[] = [];
  const sitePanels: { key: string; label: string; pick: (s: SnapshotSite | null) => SnapshotSitePanel | null }[] = [
    { key: "criticalArea", label: "Critical area", pick: (s) => s?.criticalArea ?? null },
    { key: "highSchool", label: "High school", pick: (s) => s?.highSchool ?? null },
    { key: "water", label: "Water service", pick: (s) => s?.water ?? null },
    { key: "sewer", label: "Sewer service", pick: (s) => s?.sewer ?? null },
  ];
  for (const sp of sitePanels) {
    const b = sp.pick(baseline.site)?.label ?? null;
    const a = sp.pick(current.site)?.label ?? null;
    if (b == null && a == null) continue;
    const changed = (b ?? "") !== (a ?? "");
    if (changed) unchanged++; // count toward "changed" bucket via neutral (no better/worse for text)
    else unchanged++;
    siteRows.push({
      key: `site_${sp.key}`,
      label: sp.label,
      format: "count",
      section: "Site Intelligence",
      betterWhen: "neutral",
      before: null,
      after: null,
      delta: null,
      pctChange: null,
      direction: changed ? "up" : "flat",
      outcome: "neutral",
      // Stash the text values on the row for the client to render.
      // (Kept as any-free extension via index — client reads beforeText/afterText.)
      ...( { beforeText: b, afterText: a } as object ),
    } as CompareRow);
  }
  if (siteRows.length) bySection.set("Site Intelligence", siteRows);

  const sections: CompareSection[] = sectionOrder
    .filter((name) => bySection.has(name))
    .map((name) => ({ name, rows: bySection.get(name)! }));

  const trend: "UP" | "DOWN" | "FLAT" =
    improved > regressed ? "UP" : regressed > improved ? "DOWN" : "FLAT";

  return { sections, summary: { improved, regressed, unchanged, trend } };
}
