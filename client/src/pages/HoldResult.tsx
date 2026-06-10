// Hold result page (/hold/result). Reads the full wizard state from the URL
// search params, runs the deterministic Hold engine, and renders the dual
// Long/Short scores, divergence callout, secondary metrics, and the monthly
// outflow breakdown. Sticky footer: Edit inputs (→ wizard step 2) / Save deal
// (localStorage + toast). Crossover Year + Comp Percentile cards are deferred
// to PR-C — their slots are marked with TODO hooks below.

import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Pencil, Bookmark } from "lucide-react";
import { fmtUSD, fmtPct } from "@/lib/calc";
import {
  calculateHold,
  divergenceCallout,
  crossoverYear,
  compPercentile,
} from "@/lib/holdCalc";
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
import { cn } from "@/lib/utils";

function fmtMoney0(n: number): string {
  return fmtUSD(Math.round(n));
}

export default function HoldResult() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const state = useMemo(() => decodeHoldState(search), [search]);
  const inputs = useMemo(() => toHoldInputs(state), [state]);
  const r = useMemo(() => calculateHold(inputs), [inputs]);
  const callout = useMemo(
    () => divergenceCallout(r.longScore, r.shortScore),
    [r.longScore, r.shortScore],
  );

  const cashFlowPositive = r.monthlyCashFlow >= 0;

  // Crossover Year — only meaningful when cash flow is positive and equity
  // actually overtakes it within 10 years.
  const crossover = useMemo(
    () =>
      crossoverYear(
        r.monthlyCashFlow,
        r.loanAmount,
        inputs.ratePct,
        inputs.termYears,
      ),
    [r.monthlyCashFlow, r.loanAmount, inputs.ratePct, inputs.termYears],
  );
  const showCrossover =
    r.monthlyCashFlow > 0 && crossover.crossover !== null;

  // Comp Percentile — rank against the RentCast rent band for this ZIP. Hidden
  // entirely when we have no ZIP or no comp band to work with.
  const compRents = useMemo(() => synthCompRents(state), [state]);
  const percentile = useMemo(
    () => compPercentile(r.monthlyCashFlow, compRents, r.piti),
    [r.monthlyCashFlow, compRents, r.piti],
  );
  const showPercentile = !!state.zip && compRents.length > 0;

  function handleEdit() {
    // Round-trip back to the address step (wizard STEP 2 of 7) with state.
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
      className="wizard-canvas mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10"
      style={{ paddingBottom: "calc(9rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mono-eyebrow mb-1.5 text-[10px] tracking-[0.16em] text-muted-foreground">
          RESULT
        </div>
        <h1
          className="mb-5 font-display text-[18px] font-bold leading-[1.3] tracking-[-0.01em] text-foreground"
          data-testid="text-result-address"
        >
          {state.address || "Your hold deal"}
        </h1>

        {/* HERO — monthly cash flow */}
        <div
          className="mb-3 rounded-2xl border p-[18px]"
          style={{
            background:
              "linear-gradient(135deg, rgba(18,109,133,0.18) 0%, rgba(18,109,133,0.06) 100%)",
            borderColor: "rgba(95,212,231,0.2)",
          }}
          data-testid="card-hero-cashflow"
        >
          <div className="text-[10px] font-bold tracking-[0.14em] text-accent">
            MONTHLY CASH FLOW
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span
              className={cn(
                "font-display text-[38px] font-black leading-none tracking-[-0.025em]",
                cashFlowPositive ? "text-foreground" : "text-[#f87171]",
              )}
              data-testid="text-cashflow"
            >
              {cashFlowPositive ? "" : "−"}
              {fmtMoney0(Math.abs(r.monthlyCashFlow))}
            </span>
            <span className="text-[16px] font-bold text-muted-foreground">
              /mo
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/75">
            <div>
              Rent <b className="font-bold text-white">{fmtMoney0(inputs.monthlyRent)}</b>
            </div>
            <div>
              PITI <b className="font-bold text-white">{fmtMoney0(r.piti)}</b>
            </div>
            <div>
              Reserves{" "}
              <b className="font-bold text-white">{fmtMoney0(r.reservesTotal)}</b>
            </div>
          </div>
        </div>

        {/* Dual scores */}
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <ScoreCard
            kind="long"
            label="LONG-TERM"
            name="5–10yr hold"
            score={r.longScore}
          />
          <ScoreCard
            kind="short"
            label="SHORT-TERM"
            name="cash-flow first"
            score={r.shortScore}
          />
        </div>

        {/* Divergence callout */}
        {callout && (
          <div
            className="mb-3 flex items-start gap-3 rounded-2xl border p-3.5"
            style={
              callout.tone === "gold"
                ? {
                    background:
                      "linear-gradient(135deg, rgba(251,191,36,0.08), rgba(251,191,36,0.02))",
                    borderColor: "rgba(251,191,36,0.35)",
                  }
                : {
                    background:
                      "linear-gradient(135deg, rgba(248,113,113,0.08), rgba(248,113,113,0.02))",
                    borderColor: "rgba(248,113,113,0.35)",
                  }
            }
            data-testid="callout-divergence"
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[16px] font-black"
              style={
                callout.tone === "gold"
                  ? { background: "rgba(251,191,36,0.18)", color: "#fbbf24" }
                  : { background: "rgba(248,113,113,0.18)", color: "#f87171" }
              }
            >
              {callout.icon}
            </div>
            <div className="text-[12px] leading-[1.45]">
              <b className="mb-0.5 block text-[13px] font-extrabold tracking-[-0.005em] text-foreground">
                {callout.headline}
              </b>
              <span className="text-muted-foreground">{callout.detail}</span>
            </div>
          </div>
        )}

        {/* Crossover Year — 10-year return buildup */}
        {showCrossover && (
          <CrossoverCard
            cashFlow10yr={crossover.cashFlow10yr}
            equityBuild10yr={crossover.equityBuild10yr}
            totalReturn10yr={crossover.totalReturn10yr}
            crossover={crossover.crossover as number}
          />
        )}

        {/* Comp Percentile — rank vs RentCast comps in the same ZIP */}
        {showPercentile && (
          <PercentileCard
            zip={state.zip as string}
            percentile={percentile.percentile}
            compCount={percentile.compCount}
            limited={percentile.limited}
          />
        )}

        {/* Secondary metrics */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Metric label="CASH-ON-CASH" value={fmtPct(r.cashOnCashPct)} negative={r.cashOnCashPct < 0} />
          <Metric label="CAP RATE" value={fmtPct(r.capRatePct)} negative={r.capRatePct < 0} />
          <Metric label="DSCR" value={r.dscr.toFixed(2)} negative={r.dscr < 1} />
        </div>

        {/* Monthly outflow */}
        <div className="mb-2 mt-4 text-[10px] font-bold tracking-[0.14em] text-muted-foreground">
          MONTHLY OUTFLOW
        </div>
        <div
          className="mb-2 overflow-hidden rounded-2xl border"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1c242d" }}
          data-testid="table-outflow"
        >
          <OutflowRow label="Principal & interest" value={-r.monthlyPI} />
          <OutflowRow label="Property tax" value={-r.monthlyTax} />
          <OutflowRow label="Insurance" value={-r.monthlyInsurance} />
          <OutflowRow
            label={`Maintenance reserve (${state.maintenancePct}%)`}
            value={-r.maintenance}
          />
          <OutflowRow label={`CapEx reserve (${state.capexPct}%)`} value={-r.capex} />
          <OutflowRow label={`Vacancy (${state.vacancyPct}%)`} value={-r.vacancy} />
          <OutflowRow
            label={`Management (${state.managementPct}%)`}
            value={-r.management}
          />
          <div
            className="flex items-center justify-between px-3.5 py-3 text-[12px]"
            style={{ background: "#232c37" }}
          >
            <div className="font-extrabold text-foreground">Net cash flow</div>
            <div
              className={cn(
                "font-extrabold tabular-nums",
                cashFlowPositive ? "text-[#4ade80]" : "text-[#f87171]",
              )}
              data-testid="text-net-cashflow"
            >
              {cashFlowPositive ? "+" : "−"}
              {fmtMoney0(Math.abs(r.monthlyCashFlow))}
            </div>
          </div>
        </div>

        <p className="px-1 text-[11px] leading-[1.5] text-muted-foreground/70">
          Tax {state.annualPropertyTax != null ? "from records" : "estimated"} ·
          insurance estimated at{" "}
          {fmtMoney0(estimatedAnnualInsurance(inputs.purchasePrice))}/yr.{" "}
          {state.annualPropertyTax == null &&
            `Tax ≈ ${fmtMoney0(estimatePropertyTax(inputs.purchasePrice))}/yr.`}
        </p>
      </motion.div>

      {/* Sticky footer CTAs */}
      <div
        className="fixed inset-x-0 bottom-0 border-t backdrop-blur-md"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background: "rgba(10,14,18,0.92)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="mx-auto flex max-w-2xl gap-2.5 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleEdit}
            data-testid="button-edit-inputs"
            className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-extrabold text-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
            style={{
              borderColor: "rgba(255,255,255,0.14)",
              background: "#1c242d",
            }}
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

function fmtCompact(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1000) return `$${Math.round(v / 1000)}k`;
  return `$${v}`;
}

export function CrossoverCard({
  cashFlow10yr,
  equityBuild10yr,
  totalReturn10yr,
  crossover,
}: {
  cashFlow10yr: number;
  equityBuild10yr: number;
  totalReturn10yr: number;
  crossover: number;
}) {
  const longest = Math.max(cashFlow10yr, equityBuild10yr, totalReturn10yr, 1);
  const bars = [
    {
      key: "cash",
      label: "Cash flow",
      value: cashFlow10yr,
      fill: "linear-gradient(90deg, #126D85, #5fd4e7)",
      ink: "#0a0e12",
    },
    {
      key: "equity",
      label: "Equity build",
      value: equityBuild10yr,
      fill: "linear-gradient(90deg, #7be3f0, #b8eef5)",
      ink: "#0a0e12",
    },
    {
      key: "total",
      label: "Total return",
      value: totalReturn10yr,
      fill: "linear-gradient(90deg, #ffffff, #d0f4f8)",
      ink: "#0a0e12",
    },
  ];

  return (
    <div
      className="mb-3 rounded-2xl border p-3.5"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1c242d" }}
      data-testid="card-crossover"
    >
      <div className="mb-2.5 flex items-baseline justify-between">
        <div className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground">
          10-YEAR RETURN BUILDUP
        </div>
        <div
          className="rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.04em]"
          style={{ background: "rgba(251,191,36,0.16)", color: "#fbbf24" }}
          data-testid="badge-crossover-year"
        >
          CROSSOVER · YR {crossover}
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-1.5">
        {bars.map((b) => (
          <div key={b.key} className="flex items-center gap-2.5 text-[11px]">
            <div className="w-[78px] shrink-0 font-bold text-muted-foreground">
              {b.label}
            </div>
            <div
              className="relative h-[18px] flex-1 overflow-hidden rounded-md"
              style={{ background: "#232c37" }}
            >
              <motion.div
                className="flex h-full items-center rounded-md px-2 text-[10px] font-extrabold whitespace-nowrap"
                style={{ background: b.fill, color: b.ink }}
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.max(12, (b.value / longest) * 100)}%`,
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                data-testid={`crossover-bar-${b.key}`}
              >
                {fmtCompact(b.value)}
              </motion.div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="border-t pt-2.5 text-[11px] leading-[1.55] text-muted-foreground"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <span
          className="mr-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-[0.04em]"
          style={{ background: "rgba(95,212,231,0.12)", color: "#5fd4e7" }}
        >
          Cash flow
        </span>
        leads early but{" "}
        <span
          className="mx-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-[0.04em]"
          style={{ background: "rgba(123,227,240,0.14)", color: "#7be3f0" }}
        >
          Equity build
        </span>
        takes over by year {crossover}.
      </div>
    </div>
  );
}

export function PercentileCard({
  zip,
  percentile,
  compCount,
  limited,
}: {
  zip: string;
  percentile: number;
  compCount: number;
  limited: boolean;
}) {
  // Tint + marker color follow the percentile band.
  const band: "high" | "mid" | "low" =
    percentile >= 60 ? "high" : percentile >= 40 ? "mid" : "low";
  const tint = {
    high: {
      bg: "rgba(74,222,128,0.08)",
      border: "rgba(74,222,128,0.25)",
      marker: "#4ade80",
      num: "#4ade80",
    },
    mid: {
      bg: "rgba(95,212,231,0.06)",
      border: "rgba(95,212,231,0.22)",
      marker: "#5fd4e7",
      num: "#5fd4e7",
    },
    low: {
      bg: "rgba(239,68,68,0.08)",
      border: "rgba(239,68,68,0.25)",
      marker: "#f87171",
      num: "#f87171",
    },
  }[band];

  const ordinalSuffix = (n: number): string => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  return (
    <div
      className="mb-3 rounded-2xl border p-3.5"
      style={{ background: tint.bg, borderColor: tint.border }}
      data-testid="card-percentile"
    >
      {limited ? (
        <>
          <div className="mb-1 text-[10px] font-bold tracking-[0.14em] text-muted-foreground">
            COMP PERCENTILE
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="font-display text-[20px] font-black leading-none tracking-[-0.01em] text-foreground"
              data-testid="text-percentile-limited"
            >
              Limited comps
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-[1.5] text-muted-foreground">
            Only {compCount} comparable {compCount === 1 ? "rental" : "rentals"}{" "}
            in {zip}. Need at least 5 to rank this deal.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <span
                className="font-display text-[34px] font-black leading-none tracking-[-0.02em]"
                style={{ color: tint.num }}
                data-testid="text-percentile"
              >
                {percentile}
                <span className="ml-1 text-[14px] font-bold text-muted-foreground">
                  {ordinalSuffix(percentile)} %ile
                </span>
              </span>
              <div className="mt-1 text-[11px] text-muted-foreground">
                vs {zip} ZIP comps
              </div>
            </div>

            <div className="relative flex-1">
              <div
                className="relative h-2 w-full rounded-full"
                style={{ background: "#232c37" }}
              >
                <motion.div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #126D85, #5fd4e7)",
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, percentile))}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
                <motion.div
                  className="absolute h-3.5 w-3.5 rounded-full"
                  style={{
                    top: "-3px",
                    background: tint.marker,
                    border: "3px solid #141a21",
                    transform: "translateX(-50%)",
                  }}
                  initial={{ left: 0 }}
                  animate={{ left: `${Math.max(0, Math.min(100, percentile))}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  data-testid="percentile-marker"
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-bold text-muted-foreground">
                <span>Weak</span>
                <span>Median</span>
                <span>Top</span>
              </div>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] leading-[1.5] text-muted-foreground">
            This deal cash-flows better than{" "}
            <b className="font-bold text-foreground">{percentile}%</b> of{" "}
            {compCount} comparable rentals in {zip}.
          </p>
        </>
      )}
    </div>
  );
}

function ScoreCard({
  kind,
  label,
  name,
  score,
}: {
  kind: "long" | "short";
  label: string;
  name: string;
  score: number;
}) {
  const fill =
    kind === "long"
      ? "linear-gradient(90deg, #126D85, #5fd4e7)"
      : "linear-gradient(90deg, #5fd4e7, #7be3f0)";
  return (
    <div
      className="rounded-2xl border p-3.5"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1c242d" }}
      data-testid={`card-score-${kind}`}
    >
      <div className="mb-1 text-[9px] font-bold tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mb-2 text-[12px] font-bold text-muted-foreground">
        {name}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-display text-[30px] font-black leading-none tracking-[-0.02em]",
            kind === "short" ? "text-accent" : "text-foreground",
          )}
          data-testid={`text-score-${kind}`}
        >
          {score}
        </span>
        <span className="text-[11px] font-bold text-muted-foreground">/100</span>
      </div>
      <div
        className="mt-2.5 h-1 overflow-hidden rounded-full"
        style={{ background: "#232c37" }}
      >
        <motion.i
          className="block h-full rounded-full"
          style={{ background: fill }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div
      className="rounded-xl border px-2.5 py-3"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1c242d" }}
    >
      <div className="mb-1 text-[9px] font-bold tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-[16px] font-black leading-none tracking-[-0.01em]",
          negative ? "text-[#f87171]" : "text-[#5fd4e7]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OutflowRow({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex items-center justify-between border-b px-3.5 py-2.5 text-[12px]"
      style={{ borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums text-[#f87171]">
        −{fmtMoney0(Math.abs(value))}
      </div>
    </div>
  );
}
