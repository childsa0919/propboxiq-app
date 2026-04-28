/**
 * Anne Arundel County, MD — Residential Zoning Bulk Regulations
 *
 * Source: Anne Arundel County Code, Article 18 (Zoning), Title 4 (Residential Districts)
 * Authority: codelibrary.amlegal.com (official publisher) + recent county variance rulings
 * Last verified: 2026-04-27
 *
 * Values are STANDARD subdivision bulk regulations (not cluster development).
 * All measurements in feet. Setbacks are minimums for principal structures.
 *
 * NOTES:
 *  - Cluster development uses much smaller setbacks (5ft front, 7-10ft side, 10-15ft rear).
 *    Treat any subdivision plan with a "cluster" designation as needing manual review.
 *  - Critical Area lots have additional buffer rules (typically 100ft from tidal waters).
 *    These are NOT included here — flag them separately.
 *  - Waterfront lots: front BRL is measured from the rear lot line.
 *  - "Combined sides" only listed for districts where the code requires a sum.
 */

export interface ZoningBulkRegs {
  district: string;
  description: string;
  minLotSizeSqft: number | { withSewer: number; withoutSewer: number };
  maxLotCoveragePct: number; // % of gross area
  minFrontWidthFt: number; // minimum width at front building restriction line
  setbacks: {
    frontFt: number;
    rearFt: number;
    sideFt: number;
    combinedSidesFt?: number; // only required in some districts
    cornerSideFt: number;
    principalArterialFt?: number;
  };
  maxHeightFt: number;
  maxDensityPerAcre?: number;
  codeRef: string; // e.g. "§ 18-4-501"
}

export const ANNE_ARUNDEL_RESIDENTIAL: Record<string, ZoningBulkRegs> = {
  RA: {
    district: 'RA',
    description: 'Rural Agricultural',
    minLotSizeSqft: 40000,
    maxLotCoveragePct: 25,
    minFrontWidthFt: 150,
    setbacks: {
      frontFt: 40,
      rearFt: 35,
      sideFt: 15,
      combinedSidesFt: 40,
      cornerSideFt: 40,
    },
    maxHeightFt: 45,
    maxDensityPerAcre: 1 / 20, // 1 unit per 20 acres
    codeRef: '§ 18-4-301',
  },
  RLD: {
    district: 'RLD',
    description: 'Residential Low Density',
    minLotSizeSqft: 40000,
    maxLotCoveragePct: 25,
    minFrontWidthFt: 150,
    setbacks: {
      frontFt: 50,
      rearFt: 40,
      sideFt: 20,
      combinedSidesFt: 50,
      cornerSideFt: 40,
      principalArterialFt: 75,
    },
    maxHeightFt: 45,
    maxDensityPerAcre: 1 / 5, // 1 unit per 5 acres
    codeRef: '§ 18-4-401',
  },
  R1: {
    district: 'R1',
    description: 'Residential — low-density suburban',
    minLotSizeSqft: 30000,
    maxLotCoveragePct: 50,
    minFrontWidthFt: 80,
    setbacks: {
      frontFt: 35,
      rearFt: 30,
      sideFt: 15,
      cornerSideFt: 35,
      principalArterialFt: 50,
    },
    maxHeightFt: 45,
    maxDensityPerAcre: 1 / (40000 / 43560), // 1 unit per 40,000 sf ≈ 1.09/ac
    codeRef: '§ 18-4-501',
  },
  R2: {
    district: 'R2',
    description: 'Residential — low-medium density suburban',
    // Per § 18-4-601 — county code differentiates by sewer availability
    minLotSizeSqft: { withSewer: 10000, withoutSewer: 20000 },
    maxLotCoveragePct: 60,
    minFrontWidthFt: 80,
    setbacks: {
      frontFt: 25,
      rearFt: 20,
      sideFt: 7,
      cornerSideFt: 25,
      principalArterialFt: 50,
    },
    maxHeightFt: 50,
    codeRef: '§ 18-4-601',
  },
  R5: {
    district: 'R5',
    description: 'Residential — low-medium density urban',
    minLotSizeSqft: { withSewer: 5000, withoutSewer: 10000 },
    maxLotCoveragePct: 65,
    minFrontWidthFt: 60,
    setbacks: {
      frontFt: 25,
      rearFt: 20,
      sideFt: 7,
      cornerSideFt: 15,
      principalArterialFt: 50,
    },
    maxHeightFt: 50,
    maxDensityPerAcre: 5,
    codeRef: '§ 18-4-701',
  },
};

/**
 * Compute the buildable envelope dimensions for a rectangular lot,
 * given the lot's frontage (width along street) and depth, plus the zoning district.
 *
 * Returns the maximum building footprint dimensions in feet, and total buildable sqft.
 * Also returns the lot-coverage cap so callers can show whichever is more restrictive.
 *
 * Caveats:
 *  - Assumes a rectangular lot with a single front lot line.
 *  - Does not account for easements, critical-area buffers, steep slopes, flag lots, or
 *    irregular geometry. Real envelopes always need a survey.
 */
export function computeBuildableEnvelope(params: {
  district: keyof typeof ANNE_ARUNDEL_RESIDENTIAL;
  frontageFt: number; // lot width along street
  depthFt: number; // lot depth from street
  lotSqft: number;
  isCorner?: boolean;
}): {
  envelopeWidthFt: number;
  envelopeDepthFt: number;
  envelopeSqft: number;
  coverageCapSqft: number;
  effectiveMaxFootprintSqft: number; // min(envelope, coverage cap)
  notes: string[];
} {
  const regs = ANNE_ARUNDEL_RESIDENTIAL[params.district];
  if (!regs) throw new Error(`Unknown AA County district: ${params.district}`);

  const { frontFt, rearFt, sideFt, cornerSideFt, combinedSidesFt } = regs.setbacks;

  // If corner lot, one side becomes a corner-side setback (typically larger)
  const sideA = params.isCorner ? cornerSideFt : sideFt;
  const sideB = sideFt;

  let widthMargin = sideA + sideB;
  // Enforce combined-sides minimum if applicable (RA, RLD)
  if (combinedSidesFt && widthMargin < combinedSidesFt) {
    widthMargin = combinedSidesFt;
  }

  const envelopeWidthFt = Math.max(0, params.frontageFt - widthMargin);
  const envelopeDepthFt = Math.max(0, params.depthFt - frontFt - rearFt);
  const envelopeSqft = envelopeWidthFt * envelopeDepthFt;
  const coverageCapSqft = params.lotSqft * (regs.maxLotCoveragePct / 100);
  const effectiveMaxFootprintSqft = Math.min(envelopeSqft, coverageCapSqft);

  const notes: string[] = [];
  if (envelopeSqft > coverageCapSqft) {
    notes.push(`Lot coverage cap (${regs.maxLotCoveragePct}%) is more restrictive than setbacks.`);
  } else if (coverageCapSqft > envelopeSqft) {
    notes.push('Setbacks are more restrictive than the lot-coverage cap.');
  }
  if (params.isCorner) notes.push('Corner-side setback applied to one side.');
  notes.push(`Source: AA County Code ${regs.codeRef}`);

  return {
    envelopeWidthFt,
    envelopeDepthFt,
    envelopeSqft,
    coverageCapSqft,
    effectiveMaxFootprintSqft,
    notes,
  };
}

/**
 * Try to normalize a free-text zoning string (e.g. "R-1", "r1 residential", "R1A")
 * to one of our known district keys. Returns null if no match.
 */
export function normalizeAaCountyDistrict(raw: string): keyof typeof ANNE_ARUNDEL_RESIDENTIAL | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const order: (keyof typeof ANNE_ARUNDEL_RESIDENTIAL)[] = ['RLD', 'R5', 'R2', 'R1', 'RA'];
  for (const k of order) {
    if (cleaned.startsWith(k)) return k;
  }
  return null;
}
