// Hold result page (/hold/result) — v2 / Mock 3A. Orchestrates the animated
// dual score reveal (gold pill on the winning strategy), the divergence banner,
// a KPI strip, and four projection sections: 10-year cash flow & equity,
// operating-expense breakdown, rent percentile & market trend, and BRRRR
// feasibility. The locked Hold engine (holdCalc.ts) supplies all scoring math;
// holdProjections.ts adds the forward-looking pro-forma. Sticky footer keeps the
// existing Edit inputs / Save deal actions.

import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { Pencil, Bookmark } from "lucide-react";
import { fmtUSD, fmtPct } from "@/lib/calc";
import {
  calculateHold,
  divergenceCallout,
  compPercentile,
  interpolateCurve,
  CASHFLOW_ANCHORS,
  COC_ANCHORS,
  DSCR_ANCHORS,
  EQUITY_ANCHORS,
} from "@/lib/holdCalc";
import {
  projectCashFlow,
  projectEquity,
  cashFlowBreakevenYear,
  approxIrrPct,
  opexBreakdown,
  computeBrrrr,
} from "@/lib/holdProjections";
import {
  decodeHoldState,
  encodeHoldState,
  estimatedAnnualInsurance,
  estimatePropertyTax,
  synthCompRents,
  toHoldInputs,
} from "@/lib/holdState";
import { useToast } from "@/hooks/use-toast";
import { SAVED_HOLDS_KEY } from "@/lib/savedHolds";
import ScoreCard, { type VerdictTone, type WeightFactor } from "@/components/holdResult/ScoreCard";
import DivergenceBanner from "@/components/holdResult/DivergenceBanner";
import KpiStrip, { type KpiItem } from "@/components/holdResult/KpiStrip";
import CashFlowChart from "@/components/holdResult/CashFlowChart";
import EquityChart from "@/components/holdResult/EquityChart";
import OpExBreakdown from "@/components/holdResult/OpExBreakdown";
import RentPercentile from "@/components/holdResult/RentPercentile";
import MarketTrendChart from "@/components/holdResult/MarketTrendChart";
import BrrrrFeasibility from "@/components/holdResult/BrrrrFeasibility";

const clamp01 = (n: number) => Math.max(0, Math.min(100, n));

/** Verdict label for a strategy given its score and cash-flow sign. */
function verdictFor(
  kind: "long" | "short",
  score: number,
  cashFlowPositive: boolean,
): { label: string; tone: VerdictTone } {
  if (kind === "short") {
    if (!cashFlowPositive) return { label: "BLEEDING", tone: "bad" };
    if (score >= 75) return { label: "CASH COW", tone: "gold" };
    if (score >= 50) return { label: "STEADY", tone: "default" };
    return { label: "THIN", tone: "warn" };
  }
  if (score >= 75) return { label: "SLOW BURN", tone: "gold" };
  if (score >= 50) return { label: "BUILDER", tone: "default" };
  if (score >= 30) return { label: "WEAK HOLD", tone: "warn" };
  return { label: "PASS", tone: "bad" };
}

export default function HoldResult() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const state = useMemo(() => decodeHoldState(search), [search]);
  const inputs = useMemo(() => toHoldInputs(state), [state]);
  const r = useMemo(() => calculateHold(inputs), [inputs]);

  const cashFlow = useMemo(() => projectCashFlow(inputs, 10), [inputs]);
  const equity = useMemo(() => projectEquity(inputs, 10), [inputs]);
  const breakeven = useMemo(() => cashFlowBreakevenYear(cashFlow), [cashFlow]);
  const opex = useMemo(() => opexBreakdown(r), [r]);
  const brrrr = useMemo(() => computeBrrrr(inputs), [inputs]);

  const cashFlowPositive = r.monthlyCashFlow >= 0;
  const spread = Math.abs(r.longScore - r.shortScore);
  const tie = spread < 10;
  const longWins = r.longScore >= r.shortScore;

  const callout = useMemo(
    () => divergenceCallout(r.longScore, r.shortScore),
    [r.longScore, r.shortScore],
  );

  // Banner: prefer the engine flavor; fall back to the versatile/tie message.
  const banner = useMemo(() => {
    if (callout) {
      return {
        icon: callout.icon,
        title:
          callout.kind === "slow-burn"
            ? "SLOW BURN — Long-term hold pays off"
            : callout.headline,
        detail: callout.detail,
        tone: callout.tone as "gold" | "red",
      };
    }
    if (tie) {
      return {
        icon: "⇄",
        title: "VERSATILE DEAL — works either way",
        detail: `Long-term and short-term scores are within ${spread} pts. This deal holds up whether you optimize for cash flow now or equity later.`,
        tone: "teal" as const,
      };
    }
    return null;
  }, [callout, tie, spread]);

  // Weight factors per strategy (top-3), fills derived from the same curves the
  // engine uses so the bars track the real component scores.
  const longFactors: WeightFactor[] = [
    { label: "DSCR", fill: clamp01(r.dscr < 1 ? r.dscr * 40 : interpolateCurve(r.dscr, DSCR_ANCHORS)), weightPct: 25 },
    { label: "CoC", fill: clamp01(r.cashOnCashPct < 0 ? 0 : interpolateCurve(r.cashOnCashPct, COC_ANCHORS)), weightPct: 25 },
    { label: "Equity", fill: clamp01(interpolateCurve(r.equityBuildPct, EQUITY_ANCHORS)), weightPct: 15 },
  ];
  const shortFactors: WeightFactor[] = [
    { label: "CF/mo", fill: clamp01(interpolateCurve(r.monthlyCashFlow, CASHFLOW_ANCHORS)), weightPct: 50 },
    { label: "CoC", fill: clamp01(r.cashOnCashPct < 0 ? 0 : interpolateCurve(r.cashOnCashPct, COC_ANCHORS)), weightPct: 20 },
    { label: "DSCR", fill: clamp01(r.dscr < 1 ? r.dscr * 40 : interpolateCurve(r.dscr, DSCR_ANCHORS)), weightPct: 10 },
  ];

  const longVerdict = verdictFor("long", r.longScore, cashFlowPositive);
  const shortVerdict = verdictFor("short", r.shortScore, cashFlowPositive);

  // Year 5 / Year 10 return + approx IRR for the KPI strip under the charts.
  const y5 = equity[4]?.total ?? 0;
  const y10 = equity[9]?.total ?? 0;
  const irr5 = approxIrrPct(y5, r.cashInvested, 5);
  const irr10 = approxIrrPct(y10, r.cashInvested, 10);

  const kpis: KpiItem[] = [
    {
      label: "CASH FLOW",
      value: `${cashFlowPositive ? "" : "−"}${fmtUSD(Math.abs(Math.round(r.monthlyCashFlow)))}`,
      sub: "/mo Yr 1",
      tone: cashFlowPositive ? "default" : "bad",
      subTone: cashFlowPositive ? "default" : "bad",
    },
    {
      label: "CROSSOVER",
      value: breakeven != null ? `Yr ${breakeven}` : "—",
      sub: breakeven != null ? "CF turns +" : "stays −",
      tone: "default",
    },
    {
      label: "10-YR IRR",
      value: fmtPct(irr10),
      sub: `Yr5 ${fmtPct(irr5)}`,
      tone: irr10 >= 8 ? "good" : irr10 >= 0 ? "default" : "bad",
    },
  ];

  // Rent percentile vs synthesized comp band (same source as v1).
  const compRents = useMemo(() => synthCompRents(state), [state]);
  const percentile = useMemo(
    () => compPercentile(r.monthlyCashFlow, compRents, r.piti),
    [r.monthlyCashFlow, compRents, r.piti],
  );
  const showRent = !!state.zip && compRents.length > 0 && !percentile.limited;

  function handleEdit() {
    navigate(`/hold?step=1&${encodeHoldState(state)}`);
  }

  function handleSave() {
    try {
      const raw = localStorage.getItem(SAVED_HOLDS_KEY);
      const list: unknown[] = raw ? JSON.parse(raw) : [];
      list.unshift({
        dealType: "hold",
        savedAt: new Date().toISOString(),
        address: state.address,
        zip: state.zip,
        longScore: r.longScore,
        shortScore: r.shortScore,
        monthlyCashFlow: Math.round(r.monthlyCashFlow),
        state,
      });
      localStorage.setItem(SAVED_HOLDS_KEY, JSON.stringify(list.slice(0, 100)));
      toast({
        title: "Deal saved",
        description: "Find it in your Holds bucket on the Deals page.",
      });
    } catch {
      toast({
        title: "Couldn't save",
        description: "Storage is unavailable in this browser.",
        variant: "destructive",
      });
    }
  }

  return (
    <div
      className="wizard-canvas mx-auto max-w-md px-4 py-6 sm:py-8"
      style={{ paddingBottom: "calc(9rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Header */}
      <div className="mb-3.5 px-1">
        <div className="mb-1.5 text-[9px] font-bold tracking-[0.18em] text-muted-foreground">
          HOLD RESULT
        </div>
        <h1
          className="font-display text-[17px] font-extrabold leading-[1.25] tracking-[-0.02em] text-foreground"
          data-testid="text-result-address"
        >
          {state.address || "Your hold deal"}
        </h1>
      </div>

      {/* Divergence banner */}
      {banner && (
        <DivergenceBanner icon={banner.icon} title={banner.title} detail={banner.detail} tone={banner.tone} />
      )}

      {/* Hero score pair */}
      <div className="relative mb-1 grid grid-cols-2 gap-2">
        <ScoreCard
          kind="long"
          label="LONG-TERM"
          subtitle="5–10 YR HOLD"
          score={r.longScore}
          verdict={longVerdict.label}
          verdictTone={longVerdict.tone}
          factors={longFactors}
          winner={!tie && longWins}
          delayMs={0}
        />
        <ScoreCard
          kind="short"
          label="SHORT-TERM"
          subtitle="CASH-FLOW FIRST"
          score={r.shortScore}
          verdict={shortVerdict.label}
          verdictTone={shortVerdict.tone}
          factors={shortFactors}
          winner={!tie && !longWins}
          delayMs={200}
        />
      </div>

      {/* Divergence bridge pill */}
      <div className="mb-3 flex items-center justify-center" style={{ height: 36 }}>
        <div
          className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[10px] font-extrabold tracking-[0.05em] backdrop-blur-md"
          style={{
            background: "linear-gradient(90deg, rgba(18,109,133,0.5), rgba(95,212,231,0.25), rgba(18,109,133,0.5))",
            borderColor: "rgba(95,212,231,0.35)",
            color: "#7be3f0",
          }}
          data-testid="pill-divergence-bridge"
        >
          <span>{spread} pt gap</span>
          {tie
            ? " — versatile, works either way"
            : longWins
              ? " — Long-term is the play"
              : " — Short-term is the play"}
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip items={kpis} />

      {/* 10-year cash flow & equity */}
      <SectionHead title="10-Year Cash Flow & Equity" />
      <div className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
        <ChartCard title="Monthly Cash Flow">
          <CashFlowChart cashFlow={cashFlow} crossoverYear={breakeven} />
        </ChartCard>
        <ChartCard title="Equity Build">
          <EquityChart equity={equity} />
        </ChartCard>
      </div>
      <div
        className="mt-2.5 grid grid-cols-2 gap-2 rounded-[14px] border p-[12px_14px] backdrop-blur-md"
        style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
        data-testid="strip-return-irr"
      >
        <ReturnRow year="YEAR 5" ret={y5} irr={irr5} />
        <ReturnRow year="YEAR 10" ret={y10} irr={irr10} />
      </div>

      {/* Operating expense breakdown */}
      <SectionHead title="Operating Expense Breakdown" />
      <OpExBreakdown total={opex.total} slices={opex.slices} />

      {/* Rent percentile & market trend */}
      {showRent && (
        <>
          <SectionHead title="Rent Percentile & Market Trend" />
          <div className="grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
            <RentPercentile
              rent={inputs.monthlyRent}
              percentile={percentile.percentile}
              compCount={percentile.compCount}
              radiusMiles={0.5}
            />
            <MarketTrendChart medianRent={inputs.monthlyRent} zip={state.zip ?? ""} />
          </div>
        </>
      )}

      {/* BRRRR feasibility */}
      <SectionHead title="BRRRR Feasibility" />
      <BrrrrFeasibility b={brrrr} />

      <p className="mt-4 px-1 text-[10px] leading-[1.5] text-muted-foreground/70">
        Tax {state.annualPropertyTax != null ? "from records" : "estimated"} ·
        insurance estimated at {fmtUSD(Math.round(estimatedAnnualInsurance(inputs.purchasePrice)))}/yr.{" "}
        {state.annualPropertyTax == null &&
          `Tax ≈ ${fmtUSD(Math.round(estimatePropertyTax(inputs.purchasePrice)))}/yr.`}{" "}
        Projections assume 3% rent / expense / appreciation growth.
      </p>

      {/* Sticky footer CTAs */}
      <div
        className="fixed inset-x-0 bottom-0 border-t backdrop-blur-md"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(10,14,18,0.92)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="mx-auto flex max-w-md gap-2.5 px-4 py-3">
          <button
            type="button"
            onClick={handleEdit}
            data-testid="button-edit-inputs"
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-extrabold text-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
            style={{ borderColor: "rgba(255,255,255,0.14)", background: "#1c242d" }}
          >
            <Pencil className="h-[16px] w-[16px]" strokeWidth={2.4} />
            Edit inputs
          </button>
          <button
            type="button"
            onClick={handleSave}
            data-testid="button-save-deal"
            style={{ backgroundColor: "var(--brand-teal)" }}
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] text-[14px] font-extrabold text-white shadow-[0_12px_30px_-10px_rgba(18,109,133,0.7)] transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
          >
            <Bookmark className="h-[16px] w-[16px]" strokeWidth={2.4} />
            Save deal
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pb-2.5 pt-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-[14px_12px] backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function compactK(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

function ReturnRow({ year, ret, irr }: { year: string; ret: number; irr: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9px] font-bold tracking-[0.12em] text-muted-foreground">{year}</div>
      <div className="text-[12px] font-bold tabular-nums text-foreground">
        Return <span className="font-extrabold text-[#5fd4e7]">{compactK(ret)}</span> · IRR{" "}
        <span className="font-extrabold text-[#5fd4e7]">{fmtPct(irr)}</span>
      </div>
    </div>
  );
}
