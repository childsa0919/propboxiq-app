// Stats footer: AVG $/SF, MEDIAN $/SF, LOW/HIGH $/SF, COMPS SELECTED.

import type { CompHeroStats } from "./types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function CompHeroStatsFooter({ stats }: { stats: CompHeroStats }) {
  return (
    <div
      className="grid grid-cols-4 gap-2 rounded-2xl border p-3"
      style={{ borderColor: "rgba(230,238,242,0.10)" }}
      data-testid="comp-hero-stats-footer"
    >
      <Stat label="Avg $/SF" value={stats.avgPpsf != null ? `$${stats.avgPpsf}` : "—"} />
      <Stat label="Median $/SF" value={stats.medianPpsf != null ? `$${stats.medianPpsf}` : "—"} />
      <Stat
        label="Low/High $/SF"
        value={
          stats.lowPpsf != null && stats.highPpsf != null
            ? `$${stats.lowPpsf}–$${stats.highPpsf}`
            : "—"
        }
      />
      <Stat label="Comps Selected" value={String(stats.selectedCount)} />
    </div>
  );
}
