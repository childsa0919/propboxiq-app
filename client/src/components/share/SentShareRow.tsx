// v1.8.0 Deal Sharing — one row in the Sent tab (mockup screen 4).
import type { SentShare } from "@shared/dealShares";
import { relativeTime } from "@/lib/shares";
import { SharePill } from "./SharePill";

export function sentMetaLine(s: SentShare, now = Date.now()): string {
  const when = relativeTime(s.respondedAt ?? s.createdAt, now);
  const parts = [`To ${s.recipientEmail}`];
  if (s.displayStatus === "INVITED") parts.push("no account yet", "invite emailed");
  if (s.displayStatus === "EXPIRED") parts.push("invite expired");
  if (s.texted) parts.push("texted");
  // Mid-sentence casing: "yesterday", "just now"; dates stay "Oct 12".
  parts.push(when === "Yesterday" || when === "Just now" ? when.toLowerCase() : when);
  return parts.join(" · ");
}

export function SentShareRow({ share, last }: { share: SentShare; last?: boolean }) {
  return (
    <div className={`py-[13px] ${last ? "" : "border-b border-border/60"}`} data-testid={`row-sent-${share.id}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-[15px] font-bold tracking-[-0.01em]">{share.summary.street}</div>
        <SharePill status={share.displayStatus} />
      </div>
      <div className="mt-[3px] text-[12px] text-muted-foreground">{sentMetaLine(share)}</div>
      {share.displayStatus === "INVITED" && share.expiresInDays != null && (
        <div className="mt-[3px] text-[12px] text-muted-foreground/60">
          Invite expires in {share.expiresInDays} {share.expiresInDays === 1 ? "day" : "days"}
        </div>
      )}
    </div>
  );
}
