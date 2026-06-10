import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, Home, DollarSign, ArrowRight, TrendingUp } from "lucide-react";
import { NewBadge } from "@/components/ui/NewBadge";
import { cn } from "@/lib/utils";

export type DealType = "flip" | "hold";

type StrategyMeta = {
  type: DealType;
  name: string;
  desc: string;
  metricLabel: string;
  Icon: typeof TrendingUp;
  MetricIcon: typeof TrendingUp;
  isNew: boolean;
};

const STRATEGIES: StrategyMeta[] = [
  {
    type: "flip",
    name: "Flip",
    desc: "Find margin fast with ARV, rehab logic, and resale comps.",
    metricLabel: "ARV spread",
    Icon: Pencil,
    MetricIcon: TrendingUp,
    isNew: false,
  },
  {
    type: "hold",
    name: "Hold",
    desc: "Analyze rent, expenses, and long-term upside.",
    metricLabel: "Cash flow",
    Icon: Home,
    MetricIcon: DollarSign,
    isNew: true,
  },
];

function triggerHaptic() {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (cap?.isNativePlatform?.()) {
    const haptics = (
      window as {
        Capacitor?: {
          Plugins?: {
            Haptics?: { impact?: (opts: { style: string }) => void };
          };
        };
      }
    ).Capacitor?.Plugins?.Haptics;
    haptics?.impact?.({ style: "light" });
  }
}

export function DealTypeGateway({
  defaultType = "flip",
  onContinue,
}: {
  /** Which card is pre-selected on mount. */
  defaultType?: DealType;
  /** Called with the chosen strategy when Continue is tapped. */
  onContinue: (type: DealType) => void;
}) {
  const [selected, setSelected] = useState<DealType>(defaultType);

  function select(type: DealType) {
    setSelected(type);
    triggerHaptic();
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mono-eyebrow mb-2.5 text-[10px] tracking-[0.16em]">
        Strategy
      </div>
      <h1 className="mb-2 font-display text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-foreground">
        What kind of deal are you <span className="gateway-accent">underwriting?</span>
      </h1>
      <p className="mb-7 text-[13px] leading-[1.5] text-muted-foreground">
        Choose the strategy first so we score the property the right way.
      </p>

      <div className="flex flex-1 flex-col gap-3 sm:flex-row">
        {STRATEGIES.map((s) => (
          <StrategyCard
            key={s.type}
            meta={s}
            selected={selected === s.type}
            onSelect={() => select(s.type)}
          />
        ))}
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => onContinue(selected)}
          disabled={!selected}
          data-testid="button-gateway-continue"
          style={{ backgroundColor: "var(--brand-teal)" }}
          className={cn(
            "flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] text-[14px] font-extrabold text-white transition-all duration-200",
            "shadow-[0_12px_30px_-10px_rgba(18,109,133,0.7)]",
            selected
              ? "cursor-pointer hover:brightness-110 active:scale-[0.99]"
              : "cursor-not-allowed opacity-40 shadow-none",
          )}
        >
          Continue
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
        </button>
        <p className="mt-2.5 text-center text-xs font-bold text-white/40">
          Pick a strategy to continue
        </p>
      </div>
    </div>
  );
}

function StrategyCard({
  meta,
  selected,
  onSelect,
}: {
  meta: StrategyMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  const { name, desc, metricLabel, Icon, MetricIcon, isNew } = meta;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.985 }}
      data-testid={`card-strategy-${meta.type}`}
      aria-pressed={selected}
      style={{
        background: selected
          ? "linear-gradient(135deg, rgba(18,109,133,0.25) 0%, rgba(18,109,133,0.05) 100%), #1c242d"
          : "#1c242d",
        borderColor: selected ? "rgba(95,212,231,0.55)" : "rgba(255,255,255,0.08)",
      }}
      className={cn(
        "relative flex flex-1 flex-col overflow-hidden rounded-[22px] border p-[22px] text-left transition-all duration-200",
        selected
          ? "shadow-[0_0_0_2px_rgba(95,212,231,0.22),0_18px_44px_-22px_rgba(18,109,133,0.65),0_0_42px_-14px_rgba(95,212,231,0.4)]"
          : "",
      )}
    >
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 80% 0%, rgba(95,212,231,0.18) 0%, transparent 55%)",
          }}
        />
      )}

      <div className="mb-3.5 flex items-start gap-3.5">
        <div
          style={
            selected
              ? { background: "linear-gradient(135deg, #126D85 0%, #1a8aa6 100%)", borderColor: "var(--brand-cyan)" }
              : { background: "#232c37", borderColor: "rgba(255,255,255,0.14)" }
          }
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
            selected
              ? "text-white shadow-[0_8px_20px_-8px_rgba(18,109,133,0.7)]"
              : "text-muted-foreground",
          )}
        >
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span
              className={cn(
                "text-[9px] font-extrabold tracking-[0.16em]",
                selected ? "text-accent" : "text-muted-foreground/70",
              )}
            >
              {name.toUpperCase()}
            </span>
            {isNew && <NewBadge className="px-1.5 py-0 text-[8px]" />}
          </div>
          <h2 className="font-display text-[22px] font-bold tracking-[-0.02em] text-foreground">
            {name}
          </h2>
        </div>

        <span
          style={selected ? undefined : { borderColor: "rgba(255,255,255,0.14)" }}
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200",
            selected
              ? "border-accent bg-accent shadow-[0_0_12px_rgba(95,212,231,0.5)]"
              : "",
          )}
        >
          <Check
            className={cn(
              "h-3 w-3 transition-opacity duration-200",
              selected ? "opacity-100" : "opacity-0",
            )}
            strokeWidth={3.5}
            style={{ color: "var(--brand-ink)" }}
          />
        </span>
      </div>

      <p
        className={cn(
          "mb-4 text-[13px] leading-[1.5]",
          selected ? "text-foreground/85" : "text-muted-foreground",
        )}
      >
        {desc}
      </p>

      <div
        style={{ borderTopColor: selected ? "rgba(95,212,231,0.18)" : "rgba(255,255,255,0.08)" }}
        className="mt-auto flex items-center gap-2.5 border-t pt-3.5"
      >
        <span
          style={selected ? undefined : { background: "#232c37" }}
          className={cn(
            "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md",
            selected ? "bg-accent/[0.18] text-accent" : "text-muted-foreground",
          )}
        >
          <MetricIcon className="h-[13px] w-[13px]" strokeWidth={2} />
        </span>
        <div>
          <div className="text-[9px] font-bold tracking-[0.14em] text-muted-foreground/70">
            PRIMARY METRIC
          </div>
          <div className="mt-px text-[12px] font-bold text-foreground">
            {metricLabel}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
