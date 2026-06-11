// Operating-expense breakdown (Mock 3A): doughnut with a "TOTAL OPEX / $X/mo"
// center label, a legend, and a read-only "editable-looking" defaults table.
// v1 is display-only — the pencil affordance is styled but inert. Editing is a
// follow-up PR.
// TODO(opex-edit): wire the pencil icons to inline % editing in a follow-up.

import { useMemo } from "react";
import { Doughnut } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "./chartSetup";
import { fmtUSD } from "@/lib/calc";
import type { OpExSlice } from "@/lib/holdProjections";

ensureChartsRegistered();

export interface OpExBreakdownProps {
  total: number; // $/mo
  slices: OpExSlice[];
}

export default function OpExBreakdown({ total, slices }: OpExBreakdownProps) {
  const data = useMemo<ChartData<"doughnut">>(
    () => ({
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.pct),
          backgroundColor: slices.map((s) => s.color),
          borderColor: "rgba(10,14,18,0.6)",
          borderWidth: 2,
        },
      ],
    }),
    [slices],
  );

  const options = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    }),
    [],
  );

  return (
    <div
      className="rounded-2xl border p-3.5 backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
      data-testid="card-opex"
    >
      <div className="mb-3 flex items-center gap-3.5">
        <div className="relative h-[110px] w-[110px] flex-shrink-0">
          <Doughnut data={data} options={options} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[7px] font-bold tracking-[0.12em] text-muted-foreground">
              TOTAL OPEX
            </div>
            <div className="text-center font-display text-[15px] font-black leading-[1.1] tracking-[-0.02em]">
              {fmtUSD(total)}
              <br />
              <span className="text-[9px] font-medium text-muted-foreground">/mo</span>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {slices.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[9px]">
              <div className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1 text-white/85">{s.short}</span>
              <span className="font-bold tabular-nums text-muted-foreground">{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      <table className="w-full border-collapse" data-testid="table-opex">
        <tbody>
          {slices.map((s) => (
            <tr key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <td className="py-1.5">
                <div className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
              </td>
              <td className="py-1.5 text-[10px] text-white/85">{s.label}</td>
              <td className="py-1.5 pr-1.5 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                {s.pct}%
              </td>
              <td className="py-1.5 text-right text-[10px] font-bold tabular-nums text-foreground">
                {fmtUSD(s.amount)}
                <span className="ml-1 text-[9px] text-muted-foreground opacity-60" aria-hidden>
                  ✎
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-0.5 text-[9px] leading-[1.5] text-muted-foreground/70">
        Shares are of total monthly cost including PITI. Editing is coming soon.
      </p>
    </div>
  );
}
