// Shared Hold wizard <-> result state. Serialized into URL search params so the
// result page is shareable / refreshable and the wizard's back-nav restores
// every input. Kept deliberately small and flat — one param per field.

import type { HoldInputs } from "@/lib/holdCalc";

export type RehabMode = "brrrr" | "turnkey";

export interface HoldWizardState {
  // Address / property
  address: string;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  // Reference values pulled from RentCast (for chips + scoring)
  listPrice: number | null;
  zestimate: number | null;
  valueEstimate: number | null; // RentCast value est (margin reference)
  rentLow: number | null;
  rentMedian: number | null;
  rentHigh: number | null;
  rentCompCount: number | null;
  annualPropertyTax: number | null;
  marketCapRatePct: number | null;
  // User inputs
  purchasePrice: number;
  rehabEnabled: boolean;
  rehabMode: RehabMode;
  rehab: number;
  monthlyRent: number;
  downPct: number;
  ratePct: number;
  termYears: number;
  vacancyPct: number;
  managementPct: number;
  maintenancePct: number;
  capexPct: number;
}

export const DEFAULT_HOLD_STATE: HoldWizardState = {
  address: "",
  zip: null,
  beds: null,
  baths: null,
  listPrice: null,
  zestimate: null,
  valueEstimate: null,
  rentLow: null,
  rentMedian: null,
  rentHigh: null,
  rentCompCount: null,
  annualPropertyTax: null,
  marketCapRatePct: null,
  purchasePrice: 0,
  rehabEnabled: false,
  rehabMode: "turnkey",
  rehab: 0,
  monthlyRent: 0,
  downPct: 25,
  ratePct: 7.0,
  termYears: 30,
  vacancyPct: 5,
  managementPct: 8,
  maintenancePct: 5,
  capexPct: 5,
};

/** Insurance is estimated at 0.5% of purchase price per year when not known. */
export function estimatedAnnualInsurance(purchasePrice: number): number {
  return purchasePrice * 0.005;
}

/** Build the HoldInputs the calc engine expects from wizard state. */
export function toHoldInputs(s: HoldWizardState): HoldInputs {
  return {
    purchasePrice: s.purchasePrice,
    rehab: s.rehabEnabled ? s.rehab : 0,
    monthlyRent: s.monthlyRent,
    downPct: s.downPct,
    ratePct: s.ratePct,
    termYears: s.termYears,
    annualPropertyTax: s.annualPropertyTax ?? estimatePropertyTax(s.purchasePrice),
    annualInsurance: estimatedAnnualInsurance(s.purchasePrice),
    vacancyPct: s.vacancyPct,
    managementPct: s.managementPct,
    maintenancePct: s.maintenancePct,
    capexPct: s.capexPct,
    marketCapRatePct: s.marketCapRatePct,
    valueEstimate: s.valueEstimate ?? s.listPrice ?? s.zestimate,
  };
}

/** Fallback property tax: ~1.05% of price/yr (DMV effective rate) when RentCast
 * has no tax record. */
export function estimatePropertyTax(purchasePrice: number): number {
  return purchasePrice * 0.0105;
}

/**
 * Synthesize a comp-rent distribution from the RentCast rent band (low /
 * median / high) and the reported comp count. RentCast gives us the band, not
 * the individual comps, so we reconstruct a plausible distribution: an evenly
 * spaced ramp from low→median across the lower half and median→high across the
 * upper half, sized to `rentCompCount`. Returns [] when the band is missing.
 */
export function synthCompRents(s: HoldWizardState): number[] {
  const { rentLow, rentMedian, rentHigh, rentCompCount } = s;
  if (rentLow == null || rentMedian == null || rentHigh == null) return [];
  if (!(rentHigh > rentLow)) return [];
  const n = Math.max(0, Math.round(rentCompCount ?? 0));
  if (n < 2) return [];
  const out: number[] = [];
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    const t = half <= 1 ? 0 : i / (half - 1);
    out.push(rentLow + t * (rentMedian - rentLow));
  }
  for (let i = 0; i < n - half; i++) {
    const t = n - half <= 1 ? 0 : i / (n - half - 1);
    out.push(rentMedian + t * (rentHigh - rentMedian));
  }
  return out;
}

// --- URL serialization ---------------------------------------------------

const NUM_KEYS: (keyof HoldWizardState)[] = [
  "beds",
  "baths",
  "listPrice",
  "zestimate",
  "valueEstimate",
  "rentLow",
  "rentMedian",
  "rentHigh",
  "rentCompCount",
  "annualPropertyTax",
  "marketCapRatePct",
  "purchasePrice",
  "rehab",
  "monthlyRent",
  "downPct",
  "ratePct",
  "termYears",
  "vacancyPct",
  "managementPct",
  "maintenancePct",
  "capexPct",
];

export function encodeHoldState(s: HoldWizardState): string {
  const p = new URLSearchParams();
  p.set("address", s.address);
  if (s.zip) p.set("zip", s.zip);
  p.set("rehabEnabled", s.rehabEnabled ? "1" : "0");
  p.set("rehabMode", s.rehabMode);
  for (const k of NUM_KEYS) {
    const v = s[k] as number | null;
    if (v != null && Number.isFinite(v)) p.set(k, String(v));
  }
  return p.toString();
}

export function decodeHoldState(search: string): HoldWizardState {
  const clean = search.startsWith("?") ? search.slice(1) : search;
  const p = new URLSearchParams(clean);
  const s: HoldWizardState = { ...DEFAULT_HOLD_STATE };
  const addr = p.get("address");
  if (addr) s.address = addr;
  s.zip = p.get("zip");
  s.rehabEnabled = p.get("rehabEnabled") === "1";
  const mode = p.get("rehabMode");
  if (mode === "brrrr" || mode === "turnkey") s.rehabMode = mode;
  for (const k of NUM_KEYS) {
    const raw = p.get(k);
    if (raw != null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) (s[k] as number) = n;
    }
  }
  return s;
}
