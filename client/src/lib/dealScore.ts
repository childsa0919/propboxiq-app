// Shared with the results screen and PDF. Existing scoring formula, unchanged.
export function computeDealScore(roi: number, marginPct: number, holdMonths: number) {
  const roiPart = Math.max(0, Math.min(45, roi * 0.9));
  const marginPart = Math.max(0, Math.min(45, marginPct * 1.4));
  const holdPenalty = Math.max(0, (holdMonths - 6) * 1.5);
  return Math.max(0, Math.min(100, Math.round(roiPart + marginPart + 10 - holdPenalty)));
}
