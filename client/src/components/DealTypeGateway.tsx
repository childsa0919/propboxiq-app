import { useState } from "react";
import { motion } from "framer-motion";
import { Check, TrendingUp, Home, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    Icon: TrendingUp,
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

      <div className="flex flex-1 flex-col gap-3.5 sm:flex-row">
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
        <Button
          size="lg"
          onClick={() => onContinue(selected)}
          disabled={!selected}
          data-testid="button-gateway-continue"
          className="h-12 w-full rounded-2xl font-semibold tracking-tight
                     shadow-[0_10px_30px_-12px_rgba(18,109,133,0.55)]
                     dark:shadow-[0_8px_24px_rgba(95,212,231,0.30)]"
        >
          Continue
        </Button>
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
      className={cn(
        "relative flex flex-1 flex-col overflow-hidden rounded-[20px] border p-[22px] text-left transition-all duration-200",
        selected
          ? "border-accent/55 bg-accent/[0.12] shadow-[0_0_0_2px_rgba(95,212,231,0.18),0_20px_50px_-20px_rgba(18,109,133,0.6),0_0_80px_-10px_rgba(95,212,231,0.25)]"
          : "border-card-border bg-card hover-elevate",
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
          className={cn(
            "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
            selected
              ? "border-accent bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(18,109,133,0.7)]"
              : "border-card-border bg-muted text-muted-foreground",
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
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200",
            selected
              ? "border-accent bg-accent shadow-[0_0_12px_rgba(95,212,231,0.5)]"
              : "border-card-border",
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
        className={cn(
          "mt-auto flex items-center gap-2.5 border-t pt-3.5",
          selected ? "border-accent/20" : "border-card-border",
        )}
      >
        <span
          className={cn(
            "flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md",
            selected ? "bg-accent/[0.18] text-accent" : "bg-muted text-muted-foreground",
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
