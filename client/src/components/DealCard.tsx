import { useEffect, useState } from "react";

/**
 * <DealCard />
 * Glass-morphism Deal Card that matches the propboxiq.com Direction A reference.
 *
 * Anatomy:
 *   1. Header row: "DEAL CARD" mono eyebrow + address text right, hairline divider
 *   2. Score block: "DEAL SCORE" eyebrow, then 64px JetBrains Mono score + "/100" suffix
 *   3. Cyan progress bar (6px, gradient fill, glow shadow)
 *   4. Vertical stat rows: mono labels left + Inter-bold values right
 *
 * Theme variants:
 *   - dark glass: rgba white 0.14 → 0.06 with cyan glow
 *   - light glass: rgba white 0.96 → 0.82 with hairline ink shadow
 * Both use 18px radius, 22px 24px 18px padding, blur(18px) backdrop.
 *
 * The score animates from 0 to `score` over 800ms on mount (preserves the
 * existing `react-countup` feel without the dependency).
 */

export interface DealStat {
  label: string;
  value: string;
}

const DEFAULT_STATS: DealStat[] = [
  { label: "ARV", value: "$485K" },
  { label: "ROI", value: "34%" },
  { label: "CAP RATE", value: "9.5%" },
  { label: "DAYS ON MARKET", value: "12" },
];

export function DealCard({
  score,
  address,
  stats = DEFAULT_STATS,
  animate = true,
  eyebrow = "Deal Card",
  className,
}: {
  score: number;
  address: string;
  stats?: DealStat[];
  /** Animate the score count-up + bar fill on mount. */
  animate?: boolean;
  /** Override the top-left eyebrow (default "Deal Card"). */
  eyebrow?: string;
  className?: string;
}) {
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [shown, setShown] = useState(animate ? 0 : target);
  const [barPct, setBarPct] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate) {
      setShown(target);
      setBarPct(target);
      return;
    }
    const startTime = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(eased * target));
      setBarPct(eased * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, animate]);

  return (
    <div
      className={`glass-card ${className ?? ""}`}
      style={{
        padding: "22px 24px 18px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "var(--dc-text, currentColor)",
      }}
    >
      {/* Header: eyebrow + address + hairline divider */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          paddingBottom: 14,
          marginBottom: 18,
          borderBottom: "1px solid var(--dc-divider, rgba(10,14,18,0.08))",
        }}
      >
        <span className="mono-eyebrow" style={{ fontSize: 12, letterSpacing: "0.18em" }}>
          {eyebrow}
        </span>
        <span
          style={{
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--dc-muted, rgba(10,14,18,0.66))",
          }}
        >
          {address}
        </span>
      </div>

      {/* Score block */}
      <div
        className="mono-eyebrow"
        style={{ marginBottom: 8, fontSize: 12, letterSpacing: "0.18em" }}
      >
        Deal Score
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontWeight: 700,
            fontSize: 64,
            lineHeight: 0.9,
            letterSpacing: "-0.02em",
            color: "var(--dc-score, currentColor)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {shown}
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontWeight: 500,
            fontSize: 18,
            color: "var(--dc-muted, rgba(10,14,18,0.42))",
          }}
        >
          /100
        </span>
      </div>

      {/* Cyan progress bar */}
      <div
        style={{
          height: 6,
          background: "var(--dc-track, rgba(10,14,18,0.08))",
          borderRadius: 99,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${barPct}%`,
            background:
              "linear-gradient(90deg, var(--brand-cyan), var(--brand-cyan-bright))",
            borderRadius: 99,
            boxShadow: "0 0 12px rgba(95,212,231,0.45)",
            transition: animate ? undefined : "width 200ms ease-out",
          }}
        />
      </div>

      {/* Stat rows */}
      <div style={{ marginTop: 6 }}>
        {stats.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "11px 0",
              borderBottom:
                i < stats.length - 1
                  ? "1px solid var(--dc-divider, rgba(10,14,18,0.08))"
                  : "none",
            }}
          >
            <span
              className="mono-eyebrow"
              style={{ fontSize: 12, letterSpacing: "0.16em" }}
            >
              {s.label}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: "var(--dc-text, currentColor)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Theme-scoped CSS vars (consumed by the inline styles above). The
          class is `glass-card` which already swaps bg + border per theme;
          here we just feed in text/divider tokens that depend on theme. */}
      <style>{`
        .glass-card { --dc-text: #0a0e12; --dc-muted: rgba(10,14,18,0.74); --dc-divider: rgba(10,14,18,0.08); --dc-track: rgba(10,14,18,0.08); --dc-score: #0a0e12; }
        html.dark .glass-card { --dc-text: #ffffff; --dc-muted: rgba(255,255,255,0.74); --dc-divider: rgba(255,255,255,0.16); --dc-track: rgba(255,255,255,0.14); --dc-score: #ffffff; }
      `}</style>
    </div>
  );
}
