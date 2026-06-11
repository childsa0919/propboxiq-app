// Hero score card for the Hold result page (Mock 3A). Renders a circular SVG
// score ring with a count-up number, a verdict pill, and a top-3 weight
// breakdown. The winning strategy (passed `winner`) gets the gold treatment:
// gold ring, "★ WINNING STRATEGY" tab, gold number + verdict pill. The losing
// card is standard teal and slightly dimmed. Fades in + slides up on mount with
// a stagger delay; honors prefers-reduced-motion.

import { motion, useReducedMotion } from "framer-motion";
import { useCountUp } from "./useCountUp";

const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R; // ≈ 276.46

export type VerdictTone = "gold" | "default" | "bad" | "warn";

export interface WeightFactor {
  label: string;
  /** Component score 0-100 → bar fill width. */
  fill: number;
  /** Weight of this factor in the blended score, shown as the right-hand %. */
  weightPct: number;
}

export interface ScoreCardProps {
  kind: "long" | "short";
  label: string; // "LONG-TERM" / "SHORT-TERM"
  subtitle: string; // "5–10 YR HOLD" / "CASH-FLOW FIRST"
  score: number;
  verdict: string; // "SLOW BURN", "BLEEDING", etc.
  verdictTone: VerdictTone;
  factors: WeightFactor[];
  winner: boolean;
  /** Stagger delay (ms) before this card animates in. */
  delayMs?: number;
}

const VERDICT_PILL: Record<VerdictTone, { bg: string; border: string; color: string }> = {
  gold: {
    bg: "rgba(245,201,72,0.15)",
    border: "rgba(245,201,72,0.45)",
    color: "#f5c948",
  },
  default: {
    bg: "rgba(230,238,242,0.08)",
    border: "rgba(230,238,242,0.15)",
    color: "rgba(230,238,242,0.85)",
  },
  bad: {
    bg: "rgba(248,113,113,0.1)",
    border: "rgba(248,113,113,0.3)",
    color: "#f87171",
  },
  warn: {
    bg: "rgba(251,146,60,0.1)",
    border: "rgba(251,146,60,0.3)",
    color: "#fb923c",
  },
};

export default function ScoreCard({
  kind,
  label,
  subtitle,
  score,
  verdict,
  verdictTone,
  factors,
  winner,
  delayMs = 0,
}: ScoreCardProps) {
  const reduce = useReducedMotion();
  const display = useCountUp(score, 800, reduce ? 0 : delayMs + 50);
  const dash = (Math.max(0, Math.min(100, score)) / 100) * RING_C;
  const pill = VERDICT_PILL[verdictTone];

  return (
    <motion.div
      className="relative flex flex-col items-center overflow-hidden rounded-[20px] border p-[18px_12px_16px] backdrop-blur-md"
      style={{
        minHeight: 240,
        background: winner ? "rgba(245,201,72,0.04)" : "rgba(255,255,255,0.10)",
        borderColor: winner ? "rgba(245,201,72,0.6)" : "rgba(18,109,133,0.4)",
        borderWidth: winner ? 1.5 : 1,
        boxShadow: winner
          ? "0 0 32px rgba(245,201,72,0.1), inset 0 0 24px rgba(245,201,72,0.04)"
          : undefined,
        opacity: winner ? 1 : 0.92,
      }}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: winner ? 1 : 0.92, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: reduce ? 0 : delayMs / 1000 }}
      data-testid={`card-score-${kind}`}
    >
      {/* radial glow behind the ring */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: winner
            ? "radial-gradient(ellipse 130px 130px at 50% 40%, rgba(245,201,72,0.12) 0%, transparent 70%)"
            : "radial-gradient(ellipse 120px 120px at 50% 38%, rgba(95,212,231,0.09) 0%, transparent 70%)",
        }}
      />

      {winner && (
        <div
          className="absolute left-1/2 top-[-1px] -translate-x-1/2 whitespace-nowrap rounded-b-[10px] px-2.5 py-[3px] text-[8px] font-black tracking-[0.1em]"
          style={{
            background: "#f5c948",
            color: "#0a0e12",
            boxShadow: "0 2px 12px rgba(245,201,72,0.4)",
          }}
          data-testid={`pill-winning-${kind}`}
        >
          ★ WINNING STRATEGY
        </div>
      )}

      <div
        className="relative z-[1] mb-2 text-center text-[9px] font-bold tracking-[0.16em]"
        style={{
          marginTop: winner ? 14 : 0,
          color: winner ? "rgba(245,201,72,0.7)" : "#7be3f0",
        }}
      >
        {label}
      </div>

      {/* SVG ring */}
      <div className="relative z-[1] h-28 w-28 flex-shrink-0">
        <svg viewBox="0 0 112 112" fill="none" className="h-28 w-28 -rotate-90">
          <circle
            cx="56"
            cy="56"
            r={RING_R}
            stroke={winner ? "rgba(245,201,72,0.12)" : "rgba(255,255,255,0.07)"}
            strokeWidth="8"
            fill="none"
          />
          <motion.circle
            cx="56"
            cy="56"
            r={RING_R}
            stroke={winner ? "url(#scGold)" : "url(#scTeal)"}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_C} ${RING_C}`}
            initial={reduce ? false : { strokeDashoffset: RING_C }}
            animate={{ strokeDashoffset: RING_C - dash }}
            transition={{ duration: 0.9, ease: "easeOut", delay: reduce ? 0 : delayMs / 1000 }}
          />
          <defs>
            <linearGradient id="scGold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c89b00" />
              <stop offset="100%" stopColor="#f5c948" />
            </linearGradient>
            <linearGradient id="scTeal" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#126D85" />
              <stop offset="100%" stopColor="#5fd4e7" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="font-display text-[36px] font-black leading-none tracking-[-0.03em] tabular-nums"
            style={{ color: winner ? "#f5c948" : "#5fd4e7" }}
            data-testid={`text-score-${kind}`}
          >
            {display}
          </div>
          <div className="mt-px text-[11px] font-semibold text-muted-foreground">
            /100
          </div>
        </div>
      </div>

      {/* verdict */}
      <div className="relative z-[1] mt-2.5 text-center">
        <div
          className="mb-[5px] text-[10px] font-extrabold uppercase tracking-[0.08em]"
          style={{ color: winner ? "rgba(245,201,72,0.7)" : "rgba(230,238,242,0.85)" }}
        >
          {subtitle}
        </div>
        <div
          className="inline-block rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.06em]"
          style={{ background: pill.bg, borderColor: pill.border, border: "1px solid", color: pill.color }}
          data-testid={`pill-verdict-${kind}`}
        >
          {verdict}
        </div>
      </div>

      {/* weight breakdown */}
      <div className="relative z-[1] mt-2.5 flex w-full flex-col gap-1">
        {factors.map((f) => (
          <div key={f.label} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="flex-1">{f.label}</span>
            <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, f.fill))}%`,
                  background: winner
                    ? "linear-gradient(90deg,#c89b00,#f5c948)"
                    : "linear-gradient(90deg,#126D85,#5fd4e7)",
                }}
              />
            </div>
            <span className="w-[22px] text-right font-bold" style={{ color: "rgba(230,238,242,0.85)" }}>
              {f.weightPct}%
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
