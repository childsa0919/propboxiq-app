// $/sqft horizontal bar chart — one bar per selected comp (teal gradient),
// with a dashed vertical line marking the subject's target $/sqft (the
// Comp Hero ARV anchor). Circular thumbnail placeholders sit at the left of
// each row (photos aren't guaranteed for auto comps, so we fall back to an
// initial-letter avatar). Scrolls horizontally on narrow screens if the list
// is long (mobile-first requirement).

import { COMP_HERO_COLORS } from "./palette";
import type { CompHeroCardData } from "./types";

function initials(address: string): string {
  const n = address.trim().match(/^\d+/)?.[0] ?? address.trim()[0] ?? "?";
  return n.slice(0, 3);
}

export function CompHeroSqftChart({
  comps,
  anchorPpsf,
}: {
  comps: CompHeroCardData[];
  anchorPpsf: number | null;
}) {
  const rows = comps
    .filter((c) => c.pricePerSqft != null)
    .sort((a, b) => (b.pricePerSqft ?? 0) - (a.pricePerSqft ?? 0));

  if (rows.length === 0) return null;

  const max = Math.max(...rows.map((r) => r.pricePerSqft ?? 0), anchorPpsf ?? 0) * 1.08;
  const anchorPct = anchorPpsf != null && max > 0 ? (anchorPpsf / max) * 100 : null;

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "rgba(230,238,242,0.10)" }}
      data-testid="comp-hero-sqft-chart"
    >
      <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        Price per Sqft
      </p>
      <div className="relative overflow-x-auto">
        <div className="min-w-[280px] space-y-2.5">
          {rows.map((c) => {
            const pct = max > 0 ? ((c.pricePerSqft ?? 0) / max) * 100 : 0;
            return (
              <div key={c.key} className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                  style={{ background: "rgba(95,212,231,0.15)", color: COMP_HERO_COLORS.cyan }}
                >
                  {initials(c.address)}
                </div>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-white/5">
                  <div
                    className="h-full rounded-md"
                    style={{
                      width: `${Math.max(pct, 3)}%`,
                      background: `linear-gradient(90deg, ${COMP_HERO_COLORS.teal}, ${COMP_HERO_COLORS.cyan})`,
                    }}
                  />
                  <span className="absolute inset-y-0 right-1.5 flex items-center text-[10px] font-semibold text-white">
                    ${c.pricePerSqft}
                  </span>
                </div>
              </div>
            );
          })}
          {/* Dashed subject anchor line, overlaid across the bar area. */}
          {anchorPct != null && (
            <div
              className="pointer-events-none absolute top-0 bottom-0"
              style={{
                left: `calc(2.25rem + ${anchorPct}% * (100% - 2.25rem) / 100)`,
                borderLeft: `2px dashed ${COMP_HERO_COLORS.gold}`,
              }}
            />
          )}
        </div>
      </div>
      {anchorPpsf != null && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          <span style={{ color: COMP_HERO_COLORS.gold }}>┈┈┈</span> subject anchor: $
          {anchorPpsf}/sqft
        </p>
      )}
    </div>
  );
}
