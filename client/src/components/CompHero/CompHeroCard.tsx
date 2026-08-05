// Single comp card in the 2×2 grid. Cyan filled checkbox (top-left, ≥44px tap
// target per mobile-first requirement), MANUAL gold pill (top-right, manual
// comps only), photo/placeholder, SOLD PRICE overlay, address, sqft/beds/baths
// chips, tier + attribute badges, trash icon on hover (MANUAL only).

import { Check, Trash2, Home as HomeIcon } from "lucide-react";
import { fmtUSD } from "@/lib/calc";
import { COMP_HERO_COLORS } from "./palette";
import { CompHeroCardBadges } from "./CompHeroBadges";
import type { CompHeroCardData, SaleCompsSubject } from "./types";

export function CompHeroCard({
  comp,
  selected,
  subject,
  onToggle,
  onDelete,
}: {
  comp: CompHeroCardData;
  selected: boolean;
  subject: SaleCompsSubject;
  onToggle: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border transition-opacity"
      style={{
        borderColor: "rgba(230,238,242,0.10)",
        opacity: selected ? 1 : 0.5,
        background: "rgba(255,255,255,0.03)",
      }}
      data-testid={`card-comp-hero-${comp.key}`}
    >
      {/* Checkbox — tap target 44x44px minimum. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={selected ? "Deselect comp" : "Select comp"}
        className="absolute left-1.5 top-1.5 z-10 flex h-11 w-11 items-center justify-center"
        data-testid={`checkbox-comp-hero-${comp.key}`}
      >
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md border-2"
          style={{
            borderColor: COMP_HERO_COLORS.cyan,
            background: selected ? COMP_HERO_COLORS.cyan : "transparent",
          }}
        >
          {selected && <Check className="h-4 w-4" style={{ color: "#fff" }} strokeWidth={3} />}
        </span>
      </button>

      {/* MANUAL pill */}
      {comp.isManual && (
        <span
          className="absolute right-1.5 top-1.5 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ background: "rgba(245,201,72,0.9)", color: COMP_HERO_COLORS.ink }}
        >
          Manual
        </span>
      )}

      {/* Photo */}
      <div className="relative h-32 w-full bg-white/5">
        {comp.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={comp.photoUrl} alt={comp.address} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <HomeIcon className="h-8 w-8 text-white/15" />
          </div>
        )}
        {comp.soldPrice != null && (
          <div
            className="absolute bottom-0 left-0 right-0 px-2.5 py-1.5"
            style={{ background: "linear-gradient(to top, rgba(10,14,18,0.85), transparent)" }}
          >
            <p className="text-sm font-extrabold tabular-nums text-white">
              {fmtUSD(comp.soldPrice)}
            </p>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <p className="truncate text-xs font-semibold text-foreground" title={comp.address}>
          {comp.address}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {comp.sqft != null && (
            <span className="inline-flex h-[20px] items-center rounded-full border border-white/10 bg-white/5 px-2 text-[9px] text-muted-foreground">
              {comp.sqft.toLocaleString()} sqft
            </span>
          )}
          {(comp.beds != null || comp.baths != null) && (
            <span className="inline-flex h-[20px] items-center rounded-full border border-white/10 bg-white/5 px-2 text-[9px] text-muted-foreground">
              {comp.beds ?? "—"}bd / {comp.baths ?? "—"}ba
            </span>
          )}
        </div>
        <CompHeroCardBadges comp={comp} subject={subject} />
      </div>

      {/* Trash — MANUAL only, shown on hover (always visible on touch via opacity fallback). */}
      {comp.isManual && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100 sm:opacity-0"
          style={{ background: "rgba(229,102,102,0.85)" }}
          aria-label="Remove manual comp"
          data-testid={`button-delete-comp-hero-${comp.key}`}
        >
          <Trash2 className="h-4 w-4 text-white" />
        </button>
      )}
    </div>
  );
}
