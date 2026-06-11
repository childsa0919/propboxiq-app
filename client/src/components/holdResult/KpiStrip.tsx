// Compact KPI strip for the Hold result (Mock 3A). Three glass cards with a
// small-caps label, a bold value, and an optional sub/delta line. Tone tints the
// value (bad = red, warn = orange, good = green).

export type KpiTone = "default" | "bad" | "warn" | "good";

export interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
  subTone?: KpiTone;
}

const TONE_COLOR: Record<KpiTone, string> = {
  default: "#e6eef2",
  bad: "#f87171",
  warn: "#fb923c",
  good: "#4ade80",
};

const SUB_COLOR: Record<KpiTone, string> = {
  default: "rgba(230,238,242,0.35)",
  bad: "#f87171",
  warn: "#fb923c",
  good: "#4ade80",
};

export default function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="strip-kpi">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-[14px] border p-[12px_10px] backdrop-blur-md"
          style={{ background: "rgba(255,255,255,0.10)", borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="mb-[3px] text-[8px] font-bold tracking-[0.14em] text-muted-foreground">
            {it.label}
          </div>
          <div
            className="font-display text-[17px] font-black leading-none tracking-[-0.02em] tabular-nums"
            style={{ color: TONE_COLOR[it.tone ?? "default"] }}
          >
            {it.value}
          </div>
          {it.sub && (
            <div
              className="mt-1 text-[9px] font-bold"
              style={{ color: SUB_COLOR[it.subTone ?? "default"] }}
            >
              {it.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
