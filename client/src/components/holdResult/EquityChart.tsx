// 10-year equity-build stacked area chart (Mock 3A). Three stacked layers:
// principal paydown (teal), appreciation (cyan), cumulative cash flow (gold).
// Y-axis in $k. Matches the mock's contrast tuning.

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered, CHART_COLORS } from "./chartSetup";
import type { EquityYear } from "@/lib/holdProjections";

ensureChartsRegistered();

export default function EquityChart({ equity }: { equity: EquityYear[] }) {
  const labels = equity.map((_, i) => `Y${i + 1}`);

  const data = useMemo<ChartData<"line">>(
    () => ({
      labels,
      datasets: [
        {
          data: equity.map((e) => e.principal),
          fill: true,
          backgroundColor: "rgba(18,109,133,0.4)",
          borderColor: CHART_COLORS.teal,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.4,
        },
        {
          data: equity.map((e) => e.appreciation),
          fill: true,
          backgroundColor: "rgba(95,212,231,0.25)",
          borderColor: CHART_COLORS.cyan,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.4,
        },
        {
          data: equity.map((e) => Math.max(0, e.cumCashFlow)),
          fill: true,
          backgroundColor: "rgba(245,201,72,0.15)",
          borderColor: CHART_COLORS.gold,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.4,
        },
      ],
    }),
    [equity],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          stacked: true,
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.tick, font: { size: 11 }, maxTicksLimit: 6 },
        },
        y: {
          stacked: true,
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.tick,
            font: { size: 11 },
            callback: (v) => `$${Math.round(Number(v) / 1000)}k`,
          },
        },
      },
    }),
    [],
  );

  return (
    <div className="relative h-[120px]" data-testid="chart-equity">
      <Line data={data} options={options} />
    </div>
  );
}
