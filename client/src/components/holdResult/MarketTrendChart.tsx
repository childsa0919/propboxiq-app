// 12-month area rent-trend line chart (Mock 3A). Cyan line with a soft fill and
// a highlighted dot on the latest month, a "+X% YoY" badge, and a "Area median ·
// {ZIP}" caption.
//
// TODO(rent-trend-data): the 12-month series is MOCKED client-side. RentCast's
// /markets endpoint exposes `rentData.history` (Foundation tier+) — wire a new
// `/api/rent-trend?zip=` route (or extend /api/rent-comps) to return the real
// area-median series and YoY, then pass it in via props instead of synthMonthly.

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered, CHART_COLORS } from "./chartSetup";

ensureChartsRegistered();

const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];

/**
 * Synthesize a plausible 12-month trend that ENDS at `medianRent` and rises a
 * total of ~`yoyPct` over the window. Purely cosmetic placeholder until the real
 * RentCast history series is wired (see TODO above).
 */
function synthMonthly(medianRent: number, yoyPct: number): number[] {
  const start = medianRent / (1 + yoyPct / 100);
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    // gentle ease with a touch of wobble so it doesn't look perfectly linear
    const base = start + (medianRent - start) * t;
    const wobble = Math.sin(i * 1.1) * (medianRent * 0.004);
    out.push(Math.round(base + wobble));
  }
  out[11] = Math.round(medianRent);
  return out;
}

export interface MarketTrendChartProps {
  medianRent: number;
  zip: string;
  yoyPct?: number; // default +4.2 (mocked)
}

export default function MarketTrendChart({ medianRent, zip, yoyPct = 4.2 }: MarketTrendChartProps) {
  const series = useMemo(() => synthMonthly(medianRent, yoyPct), [medianRent, yoyPct]);
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const pad = Math.max(40, (hi - lo) * 0.4);

  const data = useMemo<ChartData<"line">>(
    () => ({
      labels: MONTHS,
      datasets: [
        {
          data: series,
          borderColor: CHART_COLORS.cyan,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          backgroundColor: "rgba(95,212,231,0.07)",
          pointRadius: series.map((_, i) => (i === series.length - 1 ? 5 : 0)),
          pointBackgroundColor: CHART_COLORS.cyanBright,
        },
      ],
    }),
    [series],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: CHART_COLORS.tick, font: { size: 10 }, maxTicksLimit: 4 },
        },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.tick, font: { size: 10 }, callback: (v) => `$${v}` },
          min: Math.round((lo - pad) / 10) * 10,
          max: Math.round((hi + pad) / 10) * 10,
        },
      },
    }),
    [lo, hi, pad],
  );

  return (
    <div
      className="relative rounded-2xl border p-[14px_12px] backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
      data-testid="card-rent-trend"
    >
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        12-mo rent trend
      </div>
      <div
        className="absolute right-3 top-3 rounded-lg border px-[7px] py-[3px] text-[9px] font-extrabold"
        style={{ background: "rgba(74,222,128,0.12)", borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }}
        data-testid="badge-yoy"
      >
        +{yoyPct}% YoY
      </div>
      <div className="relative mt-2 h-20">
        <Line data={data} options={options} />
      </div>
      <div className="mt-1 text-[9px] text-white/85">Area median · {zip}</div>
    </div>
  );
}
