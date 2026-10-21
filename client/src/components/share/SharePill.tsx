// v1.8.0 Deal Sharing — status pill (mockup: NEW / PENDING / INVITED / ACCEPTED / DECLINED).
import type { ShareDisplayStatus } from "@shared/dealShares";

const TONES: Record<ShareDisplayStatus | "NEW", { bg: string; fg: string }> = {
  NEW: { bg: "rgba(245,201,72,0.14)", fg: "#f5c948" },
  PENDING: { bg: "rgba(245,201,72,0.14)", fg: "#f5c948" },
  INVITED: { bg: "rgba(95,212,231,0.14)", fg: "#5fd4e7" },
  ACCEPTED: { bg: "rgba(127,212,168,0.14)", fg: "#7fd4a8" },
  DECLINED: { bg: "rgba(229,102,102,0.14)", fg: "#e56666" },
  EXPIRED: { bg: "rgba(138,154,166,0.14)", fg: "#8a9aa6" },
};

export function SharePill({ status }: { status: ShareDisplayStatus | "NEW" }) {
  const t = TONES[status];
  return (
    <span
      className="shrink-0 rounded-full px-[9px] py-1 text-[11px] font-bold tracking-[0.03em]"
      style={{ background: t.bg, color: t.fg }}
      data-testid={`pill-${status.toLowerCase()}`}
    >
      {status}
    </span>
  );
}
