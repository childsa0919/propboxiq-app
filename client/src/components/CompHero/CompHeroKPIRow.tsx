// KPI row: 4 mini cards — $/SQFT, LOW, HIGH, COMPS — each with a tiny cyan
// sparkline behind the number (purely decorative, driven by the selected
// comps' $/sqft distribution).

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered, CHART_COLORS } from "@/components/holdResult/chartSetup";
import { fmtUSD } from "@/lib/calc";
import type { CompHeroStats } from "./types";

ensureChartsRegistered();

function Sparkline({ values }: { values: number[] }) {
  const data = useMemo<ChartData<"line">>(
    () => ({
      labels: values.map((_, i) => String(i)),
      datasets: [
        {
          data: values,
          borderColor: CHART_COLORS.cyan,
          borderWidth: 1.5,
          tension: 0.4,
          fill: true,
          backgroundColor: "rgba(95,212,231,0.10)",
          pointRadius: 0,
        },
      ],
    }),
    [values],
  );
  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false },
      },
      elements: { point: { radius: 0 } },
    }),
    [],
  );
  if (values.length < 2) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 h-6 opacity-70">
      <Line data={data} options={options} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  sparkValues,
}: {
  label: string;
  value: string;
  sparkValues?: number[];
}) {
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-3"
      style={{ borderColor: "rgba(230,238,242,0.10)", background: "rgba(255,255,255,0.03)" }}
    >
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
      {sparkValues && <Sparkline values={sparkValues} />}
    </div>
  );
}

export function CompHeroKPIRow({
  stats,
  ppsfSeries,
}: {
  stats: CompHeroStats;
  ppsfSeries: number[];
}) {
  return (
    <div className="grid grid-cols-4 gap-2" data-testid="comp-hero-kpi-row">
      <KpiCard
        label="$/Sqft"
        value={stats.avgPpsf != null ? `$${stats.avgPpsf}` : "—"}
        sparkValues={ppsfSeries}
      />
      <KpiCard label="Low" value={stats.lowPpsf != null ? fmtUSD(stats.lowPpsf) : "—"} />
      <KpiCard label="High" value={stats.highPpsf != null ? fmtUSD(stats.highPpsf) : "—"} />
      <KpiCard label="Comps" value={String(stats.selectedCount)} />
    </div>
  );
}
