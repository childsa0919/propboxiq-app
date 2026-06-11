// 10-year monthly cash-flow line chart (Mock 3A). Gold line with a soft fill,
// a highlighted dot on the breakeven year, and an "↑ Yr N crossover" label when
// cash flow turns positive within the horizon. Axis contrast tuned to the mock
// (ticks #c8d4dc/11px, grid rgba(255,255,255,0.10)).

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered, CHART_COLORS } from "./chartSetup";

ensureChartsRegistered();

export interface CashFlowChartProps {
  cashFlow: number[]; // length = years, monthly $ per year
  crossoverYear: number | null; // 1-based, or null
}

export default function CashFlowChart({ cashFlow, crossoverYear }: CashFlowChartProps) {
  const labels = cashFlow.map((_, i) => `Y${i + 1}`);

  const data = useMemo<ChartData<"line">>(
    () => ({
      labels,
      datasets: [
        {
          data: cashFlow,
          borderColor: CHART_COLORS.gold,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          backgroundColor: "rgba(245,201,72,0.06)",
          pointRadius: cashFlow.map((_, i) =>
            crossoverYear != null && i === crossoverYear - 1 ? 4 : 1.5,
          ),
          pointBackgroundColor: cashFlow.map((_, i) =>
            crossoverYear != null && i === crossoverYear - 1
              ? CHART_COLORS.gold
              : CHART_COLORS.cyan,
          ),
        },
      ],
    }),
    // labels derives from cashFlow
    [cashFlow, crossoverYear],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.tick, font: { size: 11 }, maxTicksLimit: 6 },
        },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.tick,
            font: { size: 11 },
            callback: (v) => {
              const n = Number(v);
              const r = Math.round(Math.abs(n) / 100) * 100;
              return n >= 0 ? `+$${r}` : `−$${r}`;
            },
          },
        },
      },
    }),
    [],
  );

  // Position the crossover label roughly above its x-point.
  const labelLeft =
    crossoverYear != null && cashFlow.length > 1
      ? `${((crossoverYear - 1) / (cashFlow.length - 1)) * 80 + 6}%`
      : undefined;

  return (
    <div className="relative h-[120px]" data-testid="chart-cashflow">
      <Line data={data} options={options} />
      {crossoverYear != null && (
        <div
          className="pointer-events-none absolute rounded-md border px-[5px] py-[2px] text-[7px] font-extrabold tracking-[0.08em]"
          style={{
            top: 30,
            left: labelLeft,
            color: CHART_COLORS.gold,
            background: "rgba(245,201,72,0.12)",
            borderColor: "rgba(245,201,72,0.3)",
          }}
        >
          ↑ Yr {crossoverYear} crossover
        </div>
      )}
    </div>
  );
}
