// Sticky bottom action bar: gold Export PDF (primary), teal outlined +Add Comp,
// gear Filters. Respects iOS safe-area-inset-bottom (mobile-first requirement;
// mirrors the sticky-footer pattern used in HoldResult.tsx).

import { Download, Plus, Settings2 } from "lucide-react";
import { COMP_HERO_COLORS } from "./palette";

export function CompHeroActionBar({
  onExportPdf,
  onAddComp,
  onFilters,
  exporting,
}: {
  onExportPdf: () => void;
  onAddComp: () => void;
  onFilters: () => void;
  exporting?: boolean;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md"
      style={{
        backgroundColor: "rgba(10,14,18,0.94)",
        borderColor: "rgba(230,238,242,0.10)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      data-testid="comp-hero-action-bar"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onExportPdf}
          disabled={exporting}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-60"
          style={{ background: COMP_HERO_COLORS.gold, color: COMP_HERO_COLORS.ink }}
          data-testid="button-comp-hero-export-pdf"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export PDF"}
        </button>
        <button
          type="button"
          onClick={onAddComp}
          className="flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-3 text-sm font-semibold"
          style={{ borderColor: COMP_HERO_COLORS.cyan, color: COMP_HERO_COLORS.cyan }}
          data-testid="button-comp-hero-add-comp"
        >
          <Plus className="h-4 w-4" />
          Add Comp
        </button>
        <button
          type="button"
          onClick={onFilters}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: "rgba(230,238,242,0.18)" }}
          aria-label="Filters"
          data-testid="button-comp-hero-filters"
        >
          <Settings2 className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
