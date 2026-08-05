// Badge pills for a Comp Hero card — style / water-sewer / HVAC / pool / tier.
// These mirror the existing badge component in client/src/pages/QuickResult.tsx
// (badgeStyle/HeroBadge/tierPillStyle/TierPill/CompHeroBadges) exactly: same
// colors, same match/differ/unknown logic, same tier thresholds. Per the PR
// spec, "All existing badge styles... reused — do NOT restyle them." Those
// helpers are page-local (unexported) in QuickResult.tsx, so this file holds
// an identical copy for use inside the CompHero component tree rather than
// modifying QuickResult.tsx's internals.

import {
  stylesMatch,
  combinedHvacLabel,
  hvacMatch,
  normalizeStyle,
  tierLocationLabel,
} from "@shared/propAttributes";
import type { CompHeroCardData, SaleCompsSubject } from "./types";

type BadgeTone = "match" | "differ" | "unknown";

function badgeStyle(tone: BadgeTone): React.CSSProperties {
  switch (tone) {
    case "match":
      return {
        background: "rgba(74,222,128,0.14)",
        borderColor: "rgba(74,222,128,0.4)",
        color: "#4ade80",
      };
    case "differ":
      return {
        background: "rgba(248,113,113,0.14)",
        borderColor: "rgba(248,113,113,0.4)",
        color: "#f87171",
      };
    default:
      return {
        background: "rgba(230,238,242,0.06)",
        borderColor: "rgba(230,238,242,0.18)",
        color: "rgba(230,238,242,0.6)",
      };
  }
}

function HeroBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span
      className="inline-flex h-[24px] items-center rounded-full border px-2.5 text-[10px] font-semibold leading-none whitespace-nowrap"
      style={badgeStyle(tone)}
    >
      {label}
    </span>
  );
}

function tierPillStyle(tier: number): React.CSSProperties {
  if (tier <= 2) return { background: "#7fd4a8", color: "#0a0e12" };
  if (tier <= 4) return { background: "#5fd4e7", color: "#0a0e12" };
  return {
    background: "rgba(230,238,242,0.10)",
    color: "rgba(230,238,242,0.65)",
  };
}

export function TierPill({ tier }: { tier: number }) {
  return (
    <span
      className="inline-flex h-[24px] items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-wide leading-none whitespace-nowrap"
      style={tierPillStyle(tier)}
    >
      {tierLocationLabel(tier)}
    </span>
  );
}

export function CompHeroCardBadges({
  comp,
  subject,
}: {
  comp: CompHeroCardData;
  subject: SaleCompsSubject;
}) {
  const style = normalizeStyle(comp.style ?? null);
  const styleTone: BadgeTone = !style
    ? "unknown"
    : stylesMatch(subject.style ?? null, comp.style ?? null)
      ? "match"
      : "differ";
  const styleLabel = style ? style.replace(/\b\w/g, (m) => m.toUpperCase()) : "Style —";

  const wsLabel = comp.waterSewerLabel ?? null;
  const wsTone: BadgeTone = !wsLabel
    ? "unknown"
    : subject.waterSewerLabel && subject.waterSewerLabel === wsLabel
      ? "match"
      : subject.waterSewerLabel
        ? "differ"
        : "unknown";

  const hvac = combinedHvacLabel(comp.heatingType, comp.coolingType);
  const hvacTone: BadgeTone = !hvac
    ? "unknown"
    : subject.heatingType || subject.coolingType
      ? hvacMatch(subject.heatingType, subject.coolingType, comp.heatingType, comp.coolingType)
        ? "match"
        : "differ"
      : "unknown";

  const poolTone: BadgeTone =
    comp.hasPool == null
      ? "unknown"
      : subject.hasPool == null
        ? "unknown"
        : comp.hasPool === subject.hasPool
          ? "match"
          : "differ";
  const poolLabel = comp.hasPool == null ? "Pool —" : comp.hasPool ? "Pool" : "No pool";

  // Manual comps rarely have enrichment data — skip badges that are entirely
  // unknown so MANUAL cards aren't cluttered with four "—" pills.
  if (comp.isManual && !style && !wsLabel && !hvac && comp.hasPool == null) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {comp.tier != null && <TierPill tier={comp.tier} />}
      <HeroBadge tone={styleTone} label={styleLabel} />
      <HeroBadge tone={wsTone} label={wsLabel ?? "Water/Sewer —"} />
      <HeroBadge tone={hvacTone} label={hvac ?? "HVAC —"} />
      <HeroBadge tone={poolTone} label={poolLabel} />
    </div>
  );
}
