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
import { calculateHold, divergenceCallout } from "@/lib/holdCalc";
import {
  decodeHoldState,
  encodeHoldState,
  estimatedAnnualInsurance,
  estimatePropertyTax,
  toHoldInputs,
} from "@/lib/holdState";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SAVED_HOLDS_KEY = "propboxiq:savedHolds";

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

  function handleEdit() {
    // Round-trip back to the address step (wizard STEP 2 of 7) with state.
    navigate(`/hold?step=1&${encodeHoldState(state)}`);
  }

  function handleSave() {
    try {
      const raw = localStorage.getItem(SAVED_HOLDS_KEY);
      const list: unknown[] = raw ? JSON.parse(raw) : [];
      list.unshift({
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
        description: "Find it in your Holds bucket (coming soon).",
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

        {/* TODO(PR-C): Crossover Year card slot — 10-year return buildup
            (cash flow vs equity build vs total return + crossover year). */}

        {/* TODO(PR-C): Comp Percentile card slot — rank this deal's Hold Score
            against all RentCast comps in the same ZIP at market rent. */}

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
