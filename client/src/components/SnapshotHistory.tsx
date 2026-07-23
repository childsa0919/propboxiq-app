import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { fmtUSD } from "@/lib/calc";
import type { ChangeSummary } from "@shared/snapshot";

export interface SnapshotListItem {
  id: number;
  dealId: number;
  isOriginal: boolean;
  createdAt: number;
  changeSummary: ChangeSummary | null;
  preview: {
    arv: number | null;
    rent: number | null;
    profit: number | null;
    compCount: number | null;
  } | null;
}

interface SnapshotListResponse {
  snapshots: SnapshotListItem[];
  backfilled: boolean;
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Compact ARV/Rent line with the up/down arrow driven by the row's own
// change_summary (delta vs the snapshot before it).
function DeltaArrow({ metricKey, summary }: { metricKey: string; summary: ChangeSummary | null }) {
  const m = summary?.metrics.find((x) => x.key === metricKey);
  if (!m || m.direction === "flat" || m.delta == null) return null;
  const up = m.direction === "up";
  return up ? (
    <ArrowUpRight className="inline h-3 w-3" style={{ color: "#7fd4a8" }} />
  ) : (
    <ArrowDownRight className="inline h-3 w-3" style={{ color: "#e56666" }} />
  );
}

export function SnapshotHistory({ dealId }: { dealId: number }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(true);

  const { data } = useQuery<SnapshotListResponse>({
    queryKey: ["/api/deals", dealId, "snapshots"],
    enabled: Number.isFinite(dealId),
  });

  const snapshots = data?.snapshots ?? [];
  if (snapshots.length === 0) return null;

  const latestId = snapshots[0]?.id;
  const visible = snapshots.slice(0, 4);

  return (
    <div
      style={{
        backgroundColor: "#141b22",
        borderLeft: "3px solid #5fd4e7",
        borderRadius: 8,
      }}
      className="overflow-hidden"
      data-testid="card-snapshot-history"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: "#5fd4e7" }}
        >
          Snapshot History
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{snapshots.length} snapshots</span>
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/deal/${dealId}/compare`);
            }}
            className="hover:underline"
            style={{ color: "#5fd4e7" }}
            data-testid="link-compare-all"
          >
            Compare all →
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          {visible.map((s) => {
            const isCurrent = s.id === latestId;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
                style={{
                  backgroundColor: isCurrent ? "rgba(94,212,231,0.08)" : "transparent",
                }}
                data-testid={`row-snapshot-${s.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {fmtDateTime(s.createdAt)}
                    </span>
                    {isCurrent && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: "#f5c948", color: "#0a0e12" }}
                      >
                        NOW
                      </span>
                    )}
                    {s.isOriginal && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Original
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs tabular-nums">
                    <span>
                      ARV {s.preview?.arv != null ? fmtUSD(s.preview.arv) : "—"}{" "}
                      <DeltaArrow metricKey="arv" summary={s.changeSummary} />
                    </span>
                    <span>
                      Rent {s.preview?.rent != null ? fmtUSD(s.preview.rent) : "—"}{" "}
                      <DeltaArrow metricKey="rent" summary={s.changeSummary} />
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/deal/${dealId}/compare`)}
                  className="text-xs hover:underline shrink-0"
                  style={{ color: "#5fd4e7" }}
                  data-testid={`link-view-snapshot-${s.id}`}
                >
                  {isCurrent ? "View" : "Compare"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
