// Shared types for the Comp Hero feature (v1.7.4). Kept in one file so every
// component in this folder imports the same shapes.

import type { ManualComp } from "@shared/schema";
import type { SaleComp, SaleCompsSubject } from "@/lib/useSaleComps";

export type { ManualComp };

// A tier-ranked auto comp from /api/comps, same shape as useSaleComps' SaleComp
// plus the tier field the endpoint also returns.
export type AutoComp = SaleComp & {
  tier?: 1 | 2 | 3 | 4 | 5 | 6;
  city?: string | null;
  zip?: string | null;
};

// Union card shape the grid renders — either an auto comp or a manual comp,
// normalized to a common surface so CompHeroCard doesn't need two branches
// for every field.
export interface CompHeroCardData {
  key: string; // selection key: auto comp's canonical address (SaleComp.id) or manual comp's id
  isManual: boolean;
  address: string;
  city: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  soldPrice: number | null;
  pricePerSqft: number | null;
  style: string | null;
  heatingType: string | null;
  coolingType: string | null;
  hasPool: boolean | null;
  waterSewerLabel: string | null;
  tier?: 1 | 2 | 3 | 4 | 5 | 6;
  photoUrl: string | null;
  manualId?: string; // present only for manual comps, used for delete
}

export function autoCompToCardData(c: AutoComp): CompHeroCardData {
  return {
    key: c.id,
    isManual: false,
    address: c.address,
    city: c.city ?? null,
    sqft: c.sqft ?? null,
    beds: c.beds ?? null,
    baths: c.baths ?? null,
    soldPrice: c.price ?? null,
    pricePerSqft: c.pricePerSqft ?? null,
    style: c.style ?? null,
    heatingType: c.heatingType ?? null,
    coolingType: c.coolingType ?? null,
    hasPool: c.hasPool ?? null,
    waterSewerLabel: c.waterSewerLabel ?? null,
    tier: c.tier,
    photoUrl: null,
  };
}

export function manualCompToCardData(c: ManualComp): CompHeroCardData {
  const pricePerSqft =
    c.soldPrice != null && c.sqft != null && c.sqft > 0
      ? Math.round(c.soldPrice / c.sqft)
      : null;
  return {
    key: c.id,
    isManual: true,
    address: c.address,
    city: c.city,
    sqft: c.sqft,
    beds: c.beds,
    baths: c.baths,
    soldPrice: c.soldPrice,
    pricePerSqft,
    style: c.style,
    heatingType: null,
    coolingType: null,
    hasPool: null,
    waterSewerLabel: null,
    tier: undefined,
    photoUrl: c.photoUrl,
    manualId: c.id,
  };
}

export interface CompHeroStats {
  avgPpsf: number | null;
  medianPpsf: number | null;
  lowPpsf: number | null;
  highPpsf: number | null;
  selectedCount: number;
}

export function computeStats(selected: CompHeroCardData[]): CompHeroStats {
  const ppsfList = selected
    .map((c) => c.pricePerSqft)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
  if (ppsfList.length === 0) {
    return { avgPpsf: null, medianPpsf: null, lowPpsf: null, highPpsf: null, selectedCount: selected.length };
  }
  const sorted = [...ppsfList].sort((a, b) => a - b);
  const avg = Math.round(ppsfList.reduce((a, b) => a + b, 0) / ppsfList.length);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return {
    avgPpsf: avg,
    medianPpsf: median,
    lowPpsf: sorted[0],
    highPpsf: sorted[sorted.length - 1],
    selectedCount: selected.length,
  };
}

export type { SaleCompsSubject };
