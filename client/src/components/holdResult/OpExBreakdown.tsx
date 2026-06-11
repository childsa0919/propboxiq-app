// Operating-expense breakdown (Hold v1.5.1): doughnut with a "TOTAL OPEX /
// $X/mo" center label, a legend, and an EDITABLE table. Every non-PITI row can
// be edited by % (share of total OpEx) or by $ (monthly dollars) via the toggle
// at the top. Edits flow up as `OpExOverrideMap` decimals (share of the base
// total) which the parent feeds back into the Hold engine to re-score. PITI is
// fixed — it's derived from loan terms, not adjustable here.

import { useMemo, useState } from "react";
import { Doughnut } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";
import { ensureChartsRegistered } from "./chartSetup";
import { fmtUSD } from "@/lib/calc";
import type {
  OpExSlice,
  OpExOverrideMap,
  OpExEditableKey,
} from "@/lib/holdProjections";

ensureChartsRegistered();

const EDITABLE_KEYS: ReadonlySet<string> = new Set([
  "propTax",
  "insurance",
  "vacancy",
  "mgmt",
  "maint",
  "capex",
]);

type EditMode = "pct" | "dollar";

export interface OpExBreakdownProps {
  total: number; // $/mo (live, reflects overrides)
  slices: OpExSlice[]; // live slices (reflect overrides)
  baseTotal: number; // base (unedited) total OpEx — the denominator for shares
  overrides: OpExOverrideMap;
  onOverridesChange: (next: OpExOverrideMap) => void;
}

export default function OpExBreakdown({
  total,
  slices,
  baseTotal,
  overrides,
  onOverridesChange,
}: OpExBreakdownProps) {
  const [mode, setMode] = useState<EditMode>("pct");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");

  const data = useMemo<ChartData<"doughnut">>(
    () => ({
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.amount),
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

  const hasOverrides = Object.keys(overrides).length > 0;
  const sumPct = slices.reduce((a, s) => a + s.pct, 0);
  const overBudget = sumPct > 100.5; // small tolerance for rounding

  function startEdit(s: OpExSlice) {
    if (!EDITABLE_KEYS.has(s.key)) return;
    setEditingKey(s.key);
    setDraft(mode === "pct" ? String(s.pct) : String(s.amount));
  }

  function commitEdit(key: string) {
    const raw = Number(draft);
    setEditingKey(null);
    if (!Number.isFinite(raw)) return;

    // Convert the typed value into a decimal share of the base total.
    let share: number;
    if (mode === "pct") {
      const clampedPct = Math.max(0, Math.min(100, raw));
      share = clampedPct / 100;
    } else {
      const clampedDollar = Math.max(0, raw);
      share = baseTotal > 0 ? clampedDollar / baseTotal : 0;
    }
    onOverridesChange({ ...overrides, [key as OpExEditableKey]: share });
  }

  function reset() {
    setEditingKey(null);
    onOverridesChange({});
  }

  // Validation hint when a draft is out of the 0–100% band.
  const draftNum = Number(draft);
  const draftInvalid =
    editingKey != null &&
    draft !== "" &&
    (!Number.isFinite(draftNum) ||
      draftNum < 0 ||
      (mode === "pct" && draftNum > 100));

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
            <div
              className="text-center font-display text-[15px] font-black leading-[1.1] tracking-[-0.02em]"
              data-testid="text-opex-total"
            >
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

      {/* Edit-mode toggle */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Edit by
        </span>
        <div
          className="flex overflow-hidden rounded-lg border text-[10px] font-bold"
          style={{ borderColor: "rgba(255,255,255,0.12)" }}
          data-testid="toggle-opex-mode"
        >
          {(["pct", "dollar"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setEditingKey(null);
              }}
              className="px-2.5 py-1 transition-colors"
              style={{
                background: mode === m ? "var(--brand-teal)" : "transparent",
                color: mode === m ? "#fff" : "rgba(230,238,242,0.7)",
              }}
              data-testid={`button-opex-mode-${m}`}
            >
              {m === "pct" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full border-collapse" data-testid="table-opex">
        <tbody>
          {slices.map((s) => {
            const editable = EDITABLE_KEYS.has(s.key);
            const isEditing = editingKey === s.key;
            return (
              <tr key={s.key} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <td className="py-1.5">
                  <div className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                </td>
                <td className="py-1.5 text-[10px] text-white/85">{s.label}</td>
                <td className="py-1.5 pr-1.5 text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {s.pct}%
                </td>
                <td className="py-1.5 text-right text-[10px] font-bold tabular-nums text-foreground">
                  {isEditing ? (
                    <input
                      autoFocus
                      type="number"
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitEdit(s.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(s.key);
                        if (e.key === "Escape") setEditingKey(null);
                      }}
                      className="w-[64px] rounded border bg-transparent px-1 py-0.5 text-right text-[10px] tabular-nums text-foreground outline-none"
                      style={{
                        borderColor: draftInvalid ? "#f87171" : "var(--brand-teal)",
                      }}
                      data-testid={`input-opex-${s.key}`}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => startEdit(s)}
                      className="inline-flex items-center gap-1"
                      style={{ cursor: editable ? "pointer" : "default" }}
                      data-testid={`button-opex-edit-${s.key}`}
                    >
                      {mode === "dollar" ? fmtUSD(s.amount) : `${s.pct}%`}
                      {editable && (
                        <span className="text-[9px] text-muted-foreground opacity-60" aria-hidden>
                          ✎
                        </span>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {draftInvalid && (
        <p className="mt-1.5 px-0.5 text-[9px] font-medium text-[#f87171]" data-testid="text-opex-validation">
          Enter a value between 0{mode === "pct" ? " and 100%" : " and the total"}.
        </p>
      )}
      {overBudget && (
        <p className="mt-1.5 px-0.5 text-[9px] font-medium text-[#fb923c]" data-testid="text-opex-overbudget">
          Shares sum to {Math.round(sumPct)}% — over 100%. Allowed, but you're budgeting above all-in cost.
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <p className="px-0.5 text-[9px] leading-[1.5] text-muted-foreground/70">
          Shares are of total monthly cost. PITI is fixed.
        </p>
        <button
          type="button"
          onClick={reset}
          disabled={!hasOverrides}
          className="rounded-lg border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.08em] transition-opacity"
          style={{
            borderColor: "rgba(255,255,255,0.14)",
            color: hasOverrides ? "rgba(230,238,242,0.85)" : "rgba(230,238,242,0.35)",
            opacity: hasOverrides ? 1 : 0.5,
          }}
          data-testid="button-opex-reset"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
