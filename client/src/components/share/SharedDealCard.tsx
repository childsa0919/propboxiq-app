// v1.8.0 Deal Sharing — inbox card (mockup screen 3).
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtShortUsd, initialsOf, type InboxShare } from "@shared/dealShares";
import { relativeTime } from "@/lib/shares";
import { SharePill } from "./SharePill";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-[10px] border border-border/70 bg-background px-2.5 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <b className="mt-0.5 block text-[16px] font-bold tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </b>
    </div>
  );
}

export function metaLine(s: InboxShare["summary"]): string {
  const place = [s.city, s.state].filter(Boolean).join(", ");
  return [place, s.sqft ? `${s.sqft.toLocaleString("en-US")} SF` : null, s.style].filter(Boolean).join(" · ");
}

export function SharedDealCard({
  share,
  highlighted,
  busy,
  onAccept,
  onDecline,
}: {
  share: InboxShare;
  highlighted?: boolean;
  busy?: "accept" | "decline" | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const s = share.summary;
  const profitTone = s.profit >= 0 ? "#7fd4a8" : "#e56666";
  return (
    <div
      id={`share-${share.id}`}
      className={`rounded-2xl border bg-card px-4 py-[15px] transition-shadow ${
        highlighted ? "border-[#5fd4e7]/60 shadow-[0_0_0_3px_rgba(95,212,231,0.12)]" : "border-card-border"
      }`}
      data-testid={`card-share-${share.id}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-[9px]">
          <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-[#126D85] text-[12px] font-bold text-white">
            {initialsOf(share.sender.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">{share.sender.name}</div>
            <div className="text-[12px] text-muted-foreground">{relativeTime(share.createdAt)}</div>
          </div>
        </div>
        <SharePill status="NEW" />
      </div>

      <div className="mt-3 text-[16px] font-bold tracking-[-0.01em]">{s.street}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{metaLine(s)}</div>

      <div className="mt-3 flex gap-2">
        <Kpi label="ARV" value={fmtShortUsd(s.arv)} />
        <Kpi label="Profit" value={fmtShortUsd(s.profit)} tone={profitTone} />
        <Kpi label="Price" value={fmtShortUsd(s.price)} />
      </div>

      {share.note && (
        <div className="mt-[11px] whitespace-pre-wrap rounded-r-lg border-l-2 border-[#5fd4e7] bg-background/70 px-2.5 py-2 text-[13px] leading-snug text-foreground/85">
          {share.note}
        </div>
      )}

      <div className="mt-[13px] flex gap-[9px]">
        <Button
          variant="outline"
          disabled={!!busy}
          onClick={onDecline}
          className="h-[46px] flex-1 rounded-xl bg-transparent text-[14px] font-bold"
          data-testid={`button-decline-${share.id}`}
        >
          {busy === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decline"}
        </Button>
        <Button
          disabled={!!busy}
          onClick={onAccept}
          className="h-[46px] flex-1 rounded-xl bg-[#5fd4e7] text-[14px] font-bold text-[#0a0e12] hover:bg-[#7be3f0]"
          data-testid={`button-accept-${share.id}`}
        >
          {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept & copy"}
        </Button>
      </div>
    </div>
  );
}
