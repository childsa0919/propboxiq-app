// Unified ARV computation — the single source of truth for After-Repair Value.
//
// Both the Flip result (`/api/comps`) and the Hold/BRRRR feasibility card consume
// this so their ARV numbers can never diverge. The formula anchors ARV on the
// STRONGEST finished comps (a flipper sells at the top of the range after a
// quality rehab):
//   1. Rank the pool by total sale price, descending; take the top 4.
//   2. Average those 4 comps' $/sqft → the anchor $/sqft.
//   3. ARV = anchor $/sqft × target (post-rehab) sqft, or subject sqft.
//   4. Fallback (no sqft): mean of the top-4 sale prices directly.
// Confidence band is ±7% when the total comp set is ≥6, else ±10%.

export interface ArvComp {
  id?: string;
  price: number;
  pricePerSqft: number | null;
}

export interface ArvResult {
  arv: number;
  arvLow: number;
  arvHigh: number;
  /** Mean $/sqft of the top-4-by-price comps (the anchor). Null if unavailable. */
  anchorPpsf: number | null;
  /** Fractional confidence band applied (0.07 or 0.10). */
  band: number;
  /** Ids of the top-4 comps that drove the ARV (when ids are present). */
  topCompIds: string[];
}

const mean = (arr: number[]): number =>
  arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

/**
 * Compute ARV from a ranking pool of comps.
 *
 * @param rankingPool  Comps to rank for the top-4 anchor. Callers may pre-filter
 *                     this (e.g. to style-matched comps) — the ranking always
 *                     picks the 4 highest-priced within whatever pool is passed.
 * @param arvSqft      Target/subject sqft the finished house is valued at.
 * @param bandCompCount Total comp count returned (drives the ±7%/±10% band —
 *                     kept separate so a narrowed ranking pool doesn't tighten it).
 */
export function computeArvFromComps(
  rankingPool: ArvComp[],
  arvSqft: number | null,
  bandCompCount: number,
): ArvResult {
  const topComps = [...rankingPool].sort((a, b) => b.price - a.price).slice(0, 4);

  const topPpsfList = topComps
    .map((c) => c.pricePerSqft)
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0);
  const anchorPpsf = mean(topPpsfList);
  const meanTopPrice = mean(topComps.map((c) => c.price));

  let arv = 0;
  if (arvSqft && arvSqft > 0 && anchorPpsf) {
    arv = Math.round(arvSqft * anchorPpsf);
  } else {
    arv = meanTopPrice;
  }

  const band = bandCompCount >= 6 ? 0.07 : 0.1;
  return {
    arv,
    arvLow: Math.round(arv * (1 - band)),
    arvHigh: Math.round(arv * (1 + band)),
    anchorPpsf: anchorPpsf || null,
    band,
    topCompIds: topComps.map((c) => c.id).filter((x): x is string => x != null),
  };
}
