// "Your rent rank" percentile card (Mock 3A). Horizontal gradient bar (red →
// orange → teal → green) with a vertical marker at the property's percentile.
// Shows the subject rent, comp count/radius, and an "Above/Below median"
// callout.

import { motion, useReducedMotion } from "framer-motion";
import { fmtUSD } from "@/lib/calc";

export interface RentPercentileProps {
  rent: number; // subject monthly rent
  percentile: number; // 0-100
  compCount: number;
  radiusMiles: number;
}

export default function RentPercentile({
  rent,
  percentile,
  compCount,
  radiusMiles,
}: RentPercentileProps) {
  const reduce = useReducedMotion();
  const p = Math.max(0, Math.min(100, percentile));
  const aboveMedian = p >= 50;
  const markerColor = p >= 75 ? "#4ade80" : p >= 50 ? "#126D85" : p >= 25 ? "#fb923c" : "#f87171";

  const ordinal = (n: number): string => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };

  return (
    <div
      className="rounded-2xl border p-[14px_12px] backdrop-blur-md"
      style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
      data-testid="card-rent-percentile"
    >
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        Your rent rank
      </div>
      <div className="font-display text-[16px] font-black tracking-[-0.02em] text-foreground">
        {fmtUSD(rent)}
        <span className="text-[11px] font-semibold text-muted-foreground">/mo</span>
      </div>
      <div className="mt-0.5 text-[9px] text-white/85">
        {ordinal(p)} pctile · {compCount} comps in {radiusMiles}mi
      </div>

      <div className="relative mb-1 mt-2.5 h-2 overflow-visible rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: "100%",
            background: "linear-gradient(90deg,#f87171 0%,#fb923c 30%,#126D85 55%,#4ade80 85%)",
          }}
        />
        <motion.div
          className="absolute h-4 w-4 rounded-full"
          style={{ top: -4, background: markerColor, border: "3px solid #111820", transform: "translateX(-50%)" }}
          initial={reduce ? false : { left: 0 }}
          animate={{ left: `${p}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          data-testid="rent-percentile-marker"
        />
      </div>
      <div className="flex justify-between text-[8px] font-semibold text-muted-foreground">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>

      <div
        className="mt-2 text-[9px] font-bold"
        style={{ color: aboveMedian ? "#4ade80" : "#fb923c" }}
      >
        {aboveMedian ? "Above median ✓" : "Below median"}
      </div>
    </div>
  );
}
