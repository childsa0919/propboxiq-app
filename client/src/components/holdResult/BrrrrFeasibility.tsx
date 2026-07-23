// BRRRR feasibility card (Mock 3A). Four step boxes (Buy → Rehab → Rent → Refi)
// with caret separators, then a verdict pill + one-line explanation. Math comes
// from computeBrrrr in holdProjections.ts.

import { fmtUSD } from "@/lib/calc";
import type { BrrrrResult } from "@/lib/holdProjections";

function compact(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

const VERDICT_META: Record<
  BrrrrResult["verdict"],
  { label: string; bg: string; border: string; color: string }
> = {
  "all-in": {
    label: "ALL-IN DEAL",
    bg: "rgba(74,222,128,0.12)",
    border: "rgba(74,222,128,0.35)",
    color: "#4ade80",
  },
  partial: {
    label: "PARTIAL BRRRR",
    bg: "rgba(95,212,231,0.12)",
    border: "rgba(95,212,231,0.35)",
    color: "#5fd4e7",
  },
  typical: {
    label: "TYPICAL HOLD",
    bg: "rgba(230,238,242,0.08)",
    border: "rgba(230,238,242,0.18)",
    color: "rgba(230,238,242,0.85)",
  },
};

function verdictText(b: BrrrrResult): string {
  switch (b.verdict) {
    case "all-in":
      return `${compact(Math.abs(b.cashOut - b.totalCost))} pulled back out — the refi recycles all (or more than all) of your capital. Textbook all-in BRRRR.`;
    case "partial":
      return `${compact(b.equityLeftInDeal)} equity left in deal (${b.equityPctOfCost}% of cost). Nearly full capital recycling — strong BRRRR candidate with minimal skin in the game after refi.`;
    case "typical":
      return `${compact(b.equityLeftInDeal)} equity left in deal (${b.equityPctOfCost}% of cost). Refi returns some capital but a meaningful down payment stays in — a typical buy-and-hold.`;
  }
}

function arvLine(b: BrrrrResult): string {
  if (b.arvSource.kind === "comps") {
    return `ARV ${fmtUSD(b.arv)} · from ${b.arvSource.compCount} comps at ${fmtUSD(b.arvSource.anchorPpsf)}/sqft`;
  }
  return `ARV ${fmtUSD(b.arv)} · estimated +10%`;
}

export default function BrrrrFeasibility({ b }: { b: BrrrrResult }) {
  const meta = VERDICT_META[b.verdict];
  const steps = [
    { n: 1, label: "Buy", value: compact(b.purchase), sub: "purchase" },
    { n: 2, label: "Rehab", value: compact(b.rehab), sub: "reno" },
    { n: 3, label: "Rent", value: fmtUSD(b.rent), sub: "/mo est." },
    {
      n: 4,
      label: "Refi",
      value: compact(b.refiLoan),
      sub: `75% LTV\nout ${compact(b.cashOut)}`,
    },
  ];

  return (
    <div
      className="rounded-2xl border p-3.5 backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
      data-testid="card-brrrr"
    >
      <div className="mb-3.5 flex items-center gap-1.5">
        <h3 className="text-[12px] font-extrabold tracking-[-0.01em]">BRRRR Feasibility</h3>
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black"
          style={{ background: "rgba(95,212,231,0.15)", border: "1px solid rgba(95,212,231,0.35)", color: "#5fd4e7" }}
          title="Buy, Rehab, Rent, Refinance — capital-recycling analysis"
        >
          i
        </div>
        <div
          className="ml-auto text-right text-[8.5px] font-semibold leading-[1.3] text-muted-foreground"
          data-testid="text-brrrr-arv"
        >
          {arvLine(b)}
        </div>
      </div>

      <div className="mb-3 flex items-stretch gap-1">
        {steps.map((s, i) => (
          <div key={s.n} className="flex flex-1 items-stretch gap-1">
            <div
              className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border p-[10px_8px] text-center"
              style={{ background: "#19222c", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div
                className="mb-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-extrabold"
                style={{ background: "rgba(95,212,231,0.12)", border: "1px solid rgba(95,212,231,0.3)", color: "#5fd4e7" }}
              >
                {s.n}
              </div>
              <div className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {s.label}
              </div>
              <div className="font-display text-[11px] font-extrabold leading-[1.2] tracking-[-0.01em] tabular-nums">
                {s.value}
              </div>
              <div className="whitespace-pre-line text-[8px] font-medium leading-[1.3] text-muted-foreground">
                {s.sub}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center self-center pb-4 text-[12px] text-muted-foreground">›</div>
            )}
          </div>
        ))}
      </div>

      <div
        className="flex items-start gap-2.5 rounded-xl border p-[10px_12px]"
        style={{ background: "rgba(95,212,231,0.08)", borderColor: "rgba(95,212,231,0.25)" }}
      >
        <div
          className="inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-extrabold tracking-[0.08em]"
          style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
          data-testid="pill-brrrr-verdict"
        >
          {meta.label}
        </div>
        <div className="text-[10px] leading-[1.45] text-white/85">{verdictText(b)}</div>
      </div>
    </div>
  );
}
