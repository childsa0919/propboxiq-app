// Market · ZIP Snapshot panel — v1.4.1
// Pulls /api/market/:zip and renders 5 KPIs (DOM, months supply, active
// listings, median list, median sale) with month-over-month delta chips.
// Visible whenever a ZIP exists; missing metrics render as "—" with no chip.

import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Home,
  LayoutGrid,
  DollarSign,
  LineChart,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

interface MetricCount {
  value: number | null;
  delta: number | null;
}
interface MetricDom {
  value: number | null;
  deltaDays: number | null;
}
interface MetricPct {
  value: number | null;
  deltaPct: number | null;
}

interface MarketResponse {
  zip: string;
  monthLabel: string | null;
  daysOnMarket: MetricDom;
  monthsSupply: MetricCount;
  activeListings: MetricCount;
  medianList: MetricPct;
  medianSale: MetricPct;
  source: { rentcast: boolean; attom: boolean };
}

const EM_DASH = "—";

function formatMoneyCompact(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return EM_DASH;
  if (Math.abs(n) >= 1_000_000) {
    return `$${(Math.round(n / 100_000) / 10).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `$${Math.round(n / 1_000)}K`;
  }
  return `$${Math.round(n)}`;
}

function todayLabel(): string {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

interface DeltaChipProps {
  // Positive = numerically up; negative = numerically down. null = no chip.
  numericDelta: number | null;
  // Display label (e.g. "+6", "−0.3", "+2.1%", "−4d"). Computed by caller.
  label: string;
  testId: string;
}

function DeltaChip({ numericDelta, label, testId }: DeltaChipProps) {
  if (numericDelta == null || numericDelta === 0) return null;
  const up = numericDelta > 0;
  return (
    <span
      data-testid={testId}
      className={`mt-2 inline-flex items-center gap-[3px] rounded-md px-[7px] py-[3px] pl-[5px] font-mono text-[11px] font-semibold leading-none ${
        up
          ? "border border-[rgba(95,212,231,0.16)] bg-[rgba(95,212,231,0.08)] text-[#5fd4e7]"
          : "border border-[rgba(240,138,138,0.18)] bg-[rgba(240,138,138,0.07)] text-[#f08a8a]"
      }`}
    >
      {up ? (
        <svg viewBox="0 0 12 12" fill="currentColor" className="h-[9px] w-[9px]">
          <path d="M6 2l4 5H2z" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" fill="currentColor" className="h-[9px] w-[9px]">
          <path d="M6 10L2 5h8z" />
        </svg>
      )}
      {label}
    </span>
  );
}

interface KpiCardProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string;
  unit?: string;
  deltaChip?: React.ReactNode;
  span2?: boolean;
  testId: string;
}

function KpiCard({ Icon, label, value, unit, deltaChip, span2, testId }: KpiCardProps) {
  return (
    <div
      data-testid={testId}
      className={`relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#11161c] px-[14px] pb-3 pt-[14px] md:px-[18px] md:pb-4 md:pt-[18px] ${
        span2 ? "col-span-2 md:col-span-1" : ""
      }`}
    >
      <div className="mb-2 flex items-center gap-[6px] font-sans text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#6b7785]">
        <Icon className="h-3 w-3 text-[#126D85] opacity-90" />
        {label}
      </div>
      <div className="flex items-baseline">
        <span
          className={`font-mono font-semibold leading-[1.05] tracking-[-0.01em] text-[#e8eef3] ${
            span2 ? "text-[26px] md:text-[24px]" : "text-[22px] md:text-[24px]"
          }`}
        >
          {value}
        </span>
        {unit ? (
          <span className="ml-1 font-sans text-[12px] font-medium text-[#9aa6b2]">{unit}</span>
        ) : null}
      </div>
      {deltaChip}
    </div>
  );
}

function ShimmerLine({ width }: { width: string }) {
  return (
    <div
      className="h-5 animate-pulse rounded-md bg-white/[0.06]"
      style={{ width }}
    />
  );
}

interface Props {
  zip: string | null | undefined;
  // Optional address fallback — for older saved deals where the dedicated
  // zip column is null but the ZIP is embedded in the address string
  // (e.g. "8204 Suez Ave, Millersville, MD 21108").
  address?: string | null | undefined;
}

export function MarketStatsPanel({ zip, address }: Props) {
  // Extract the first 5-digit ZIP from messy inputs: handles plain "21122",
  // ZIP+4 "21122-1234", embedded "Pasadena, MD 21122", or extra whitespace.
  // Falls back to scanning the address string for older saved deals that
  // never captured a separate ZIP column. For deals with no extractable
  // ZIP at all, we still render the panel with em-dashes so the user can
  // see the feature is available and knows to add a ZIP to the deal record.
  const sources = [zip, address].map((v) => (v ? String(v).trim() : ""));
  let cleanZip = "";
  for (const s of sources) {
    const m = s.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (m) {
      cleanZip = m[1];
      break;
    }
  }
  const hasZip = cleanZip.length === 5;

  const { data, isLoading } = useQuery<MarketResponse>({
    queryKey: ["/api/market", cleanZip],
    enabled: hasZip,
    // 5-second-max loader: queries auto-resolve, but we never block render
    // beyond that. queryClient defaults already disable retry/refetch.
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ----- DOM -----
  const domVal = data?.daysOnMarket.value ?? null;
  const domDelta = data?.daysOnMarket.deltaDays ?? null;
  const domLabel =
    domDelta == null
      ? ""
      : domDelta > 0
        ? `slower · +${domDelta}d MoM`
        : `faster · −${Math.abs(domDelta)}d MoM`;

  // ----- Months supply -----
  const supVal = data?.monthsSupply.value ?? null;
  const supDelta = data?.monthsSupply.delta ?? null;
  const supLabel = supDelta == null ? "" : formatSignedDecimal(supDelta);

  // ----- Active listings -----
  const actVal = data?.activeListings.value ?? null;
  const actDelta = data?.activeListings.delta ?? null;
  const actLabel = actDelta == null ? "" : formatSignedInt(actDelta);

  // ----- Median list / sale -----
  const listVal = data?.medianList.value ?? null;
  const listDelta = data?.medianList.deltaPct ?? null;
  const listLabel = listDelta == null ? "" : `${formatSignedDecimal(listDelta)}%`;

  const saleVal = data?.medianSale.value ?? null;
  const saleDelta = data?.medianSale.deltaPct ?? null;
  const saleLabel = saleDelta == null ? "" : `${formatSignedDecimal(saleDelta)}%`;

  // Section header subtitle: "21122 · APR 26"
  const zipMonth = hasZip
    ? `${cleanZip}${data?.monthLabel ? ` · ${data.monthLabel}` : ""}`
    : "NO ZIP · ADD TO DEAL";

  return (
    <section
      data-testid="market-stats-panel"
      className="mb-8 rounded-[18px] border border-white/[0.08] bg-[#0a0e12] p-5 md:px-7 md:pb-8 md:pt-7"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Section header */}
      <div className="flex items-baseline justify-between pb-3 md:pb-[18px]">
        <span
          className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#e8eef3] md:text-[14px]"
          data-testid="market-stats-title"
        >
          <span
            className="inline-block h-[6px] w-[6px] rounded-[1px] bg-[#126D85]"
            style={{ boxShadow: "0 0 0 3px rgba(18,109,133,.18)" }}
          />
          Market · ZIP Snapshot
        </span>
        <span
          className="font-mono text-[11px] tracking-[0.06em] text-[#6b7785]"
          data-testid="market-stats-zip-month"
        >
          {zipMonth}
        </span>
      </div>

      {/* KPI grid — mobile: span-2 DOM + 2x2; desktop: 5-up row */}
      <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5 md:gap-3">
        {isLoading ? (
          <>
            <div className="col-span-2 md:col-span-1 rounded-[14px] border border-white/[0.08] bg-[#11161c] p-4">
              <ShimmerLine width="40%" />
              <div className="mt-3"><ShimmerLine width="55%" /></div>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-[14px] border border-white/[0.08] bg-[#11161c] p-4">
                <ShimmerLine width="60%" />
                <div className="mt-3"><ShimmerLine width="45%" /></div>
              </div>
            ))}
          </>
        ) : (
          <>
            <KpiCard
              testId="kpi-days-on-market"
              Icon={Clock}
              label="Days on Market"
              value={domVal == null ? EM_DASH : String(domVal)}
              unit={domVal == null ? undefined : "days avg"}
              span2
              deltaChip={
                domDelta == null ? null : (
                  // DOM going DOWN (faster) is GOOD — show cyan up-arrow chip.
                  // DOM going UP (slower) is BAD — show red down-arrow chip.
                  // Spec says: numeric direction. UP number = cyan, DOWN = red.
                  <DeltaChip
                    numericDelta={domDelta}
                    label={domLabel}
                    testId="kpi-days-on-market-delta"
                  />
                )
              }
            />
            <KpiCard
              testId="kpi-months-supply"
              Icon={Home}
              label="Months Supply"
              value={supVal == null ? EM_DASH : supVal.toFixed(1)}
              unit={supVal == null ? undefined : "mo"}
              deltaChip={
                supDelta == null ? null : (
                  <DeltaChip
                    numericDelta={supDelta}
                    label={supLabel}
                    testId="kpi-months-supply-delta"
                  />
                )
              }
            />
            <KpiCard
              testId="kpi-active-listings"
              Icon={LayoutGrid}
              label="Active Listings"
              value={actVal == null ? EM_DASH : String(actVal)}
              deltaChip={
                actDelta == null ? null : (
                  <DeltaChip
                    numericDelta={actDelta}
                    label={actLabel}
                    testId="kpi-active-listings-delta"
                  />
                )
              }
            />
            <KpiCard
              testId="kpi-median-list"
              Icon={DollarSign}
              label="Median List"
              value={formatMoneyCompact(listVal)}
              deltaChip={
                listDelta == null ? null : (
                  <DeltaChip
                    numericDelta={listDelta}
                    label={listLabel}
                    testId="kpi-median-list-delta"
                  />
                )
              }
            />
            <KpiCard
              testId="kpi-median-sale"
              Icon={LineChart}
              label="Median Sale"
              value={formatMoneyCompact(saleVal)}
              deltaChip={
                saleDelta == null ? null : (
                  <DeltaChip
                    numericDelta={saleDelta}
                    label={saleLabel}
                    testId="kpi-median-sale-delta"
                  />
                )
              }
            />
          </>
        )}
      </div>

      {/* Source / refreshed footer */}
      <div
        className="mt-[14px] flex items-center justify-between border-t border-white/[0.08] pt-3 font-mono text-[10.5px] tracking-[0.04em] text-[#6b7785]"
        data-testid="market-stats-footer"
      >
        <span className="inline-flex items-center">
          <span
            className="mr-[6px] inline-block h-[6px] w-[6px] rounded-full bg-[#5fd4e7] align-middle"
            style={{ boxShadow: "0 0 8px rgba(95,212,231,.6)" }}
          />
          Source · {sourceLabel(data?.source)}
        </span>
        <span>Refreshed · {todayLabel()} · cached 24h</span>
      </div>
    </section>
  );
}

function sourceLabel(s: { rentcast: boolean; attom: boolean } | undefined): string {
  if (!s) return "RentCast";
  const parts: string[] = [];
  if (s.rentcast) parts.push("RentCast");
  if (s.attom) parts.push("ATTOM");
  return parts.length === 0 ? "cached" : parts.join(" + ");
}

function formatSignedInt(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}
function formatSignedDecimal(n: number): string {
  const v = Math.abs(n).toFixed(1).replace(/\.0$/, "");
  return n > 0 ? `+${v}` : `−${v}`;
}
