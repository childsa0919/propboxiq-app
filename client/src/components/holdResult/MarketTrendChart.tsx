// 12-month area rent-trend line chart (Mock 3A). Cyan line with a soft fill and
// a highlighted dot on the latest month, a "+X.X% YoY" badge, and an "Area
// median · {ZIP}" caption. Data is the real RentCast /markets rentalData history
// (via /api/rent-market → useRentMarket); when the area has no market data the
// card shows a clear empty state instead.

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered, CHART_COLORS } from "./chartSetup";
import type { RentMarketPoint } from "@/lib/useRentMarket";

ensureChartsRegistered();

// "YYYY-MM" → short month label ("Jan", "Feb", …) for the x-axis.
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? MONTH_NAMES[m - 1] : ym;
}

export interface MarketTrendChartProps {
  zip: string;
  history: RentMarketPoint[];
  yoyChange: number;
  isLoading?: boolean;
  available?: boolean;
}

function Shell({
  zip,
  children,
  badge,
}: {
  zip: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl border p-[14px_12px] backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
      data-testid="card-rent-trend"
    >
      <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        12-mo rent trend
      </div>
      {badge}
      {children}
      <div className="mt-1 text-[9px] text-white/85">Area median · {zip || "—"}</div>
    </div>
  );
}

export default function MarketTrendChart({
  zip,
  history,
  yoyChange,
  isLoading = false,
  available = true,
}: MarketTrendChartProps) {
  const series = useMemo(() => history.map((h) => h.median), [history]);
  const labels = useMemo(() => history.map((h) => monthLabel(h.month)), [history]);

  const data = useMemo<ChartData<"line">>(
    () => ({
      labels,
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
    [series, labels],
  );

  const { lo, hi, pad } = useMemo(() => {
    if (series.length === 0) return { lo: 0, hi: 0, pad: 40 };
    const lo = Math.min(...series);
    const hi = Math.max(...series);
    return { lo, hi, pad: Math.max(40, (hi - lo) * 0.4) };
  }, [series]);

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

  if (isLoading) {
    return (
      <Shell zip={zip}>
        <div className="flex h-20 items-center justify-center text-[10px] text-muted-foreground">
          Loading trend…
        </div>
      </Shell>
    );
  }

  if (!available || series.length < 2) {
    return (
      <Shell zip={zip}>
        <div className="flex h-20 items-center justify-center px-2 text-center text-[10px] leading-[1.4] text-muted-foreground">
          Trend data unavailable for this area
        </div>
      </Shell>
    );
  }

  const yoyPositive = yoyChange >= 0;
  const badge = (
    <div
      className="absolute right-3 top-3 rounded-lg border px-[7px] py-[3px] text-[9px] font-extrabold"
      style={
        yoyPositive
          ? { background: "rgba(74,222,128,0.12)", borderColor: "rgba(74,222,128,0.3)", color: "#4ade80" }
          : { background: "rgba(248,113,113,0.12)", borderColor: "rgba(248,113,113,0.3)", color: "#f87171" }
      }
      data-testid="badge-yoy"
    >
      {yoyPositive ? "+" : ""}
      {yoyChange.toFixed(1)}% YoY
    </div>
  );

  return (
    <Shell zip={zip} badge={badge}>
      <div className="relative mt-2 h-20">
        <Line data={data} options={options} />
      </div>
    </Shell>
  );
}
