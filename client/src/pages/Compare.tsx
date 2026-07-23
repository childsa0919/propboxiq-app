import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { fmtUSD } from "@/lib/calc";
import type { SnapshotListItem } from "@/components/SnapshotHistory";
import type { CompareResult, CompareRow, MetricFormat } from "@shared/snapshot";

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtValue(v: number | null, format: MetricFormat): string {
  if (v == null) return "—";
  switch (format) {
    case "money":
      return fmtUSD(v);
    case "percent":
      return `${v.toFixed(1)}%`;
    case "bps":
      return `${Math.round(v)} bps`;
    case "ratio":
      return v.toFixed(2);
    case "count":
      return String(Math.round(v));
    default:
      return String(v);
  }
}

// Delta chip text, e.g. "↑ $6k · +1.2%".
function deltaLabel(row: CompareRow): string | null {
  if (row.delta == null || row.direction === "flat") return null;
  const arrow = row.direction === "up" ? "↑" : "↓";
  const mag = fmtValue(Math.abs(row.delta), row.format);
  const pct =
    row.pctChange != null
      ? ` · ${row.pctChange >= 0 ? "+" : ""}${row.pctChange.toFixed(1)}%`
      : "";
  return `${arrow} ${mag}${pct}`;
}

// Colors keyed off outcome (improved=green, regressed=red, neutral=grey).
function outcomeColor(outcome: CompareRow["outcome"]): string {
  if (outcome === "improved") return "#7fd4a8";
  if (outcome === "regressed") return "#e56666";
  return "#8a97a3";
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const dealId = Number(id);
  const [, navigate] = useLocation();

  const { data } = useQuery<{ snapshots: SnapshotListItem[] }>({
    queryKey: ["/api/deals", dealId, "snapshots"],
    enabled: Number.isFinite(dealId),
  });
  const snapshots = useMemo(() => data?.snapshots ?? [], [data]);

  const [baselineId, setBaselineId] = useState<number | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);

  // Default: current = latest, baseline = the one before it (or original).
  useEffect(() => {
    if (snapshots.length === 0) return;
    setCurrentId((c) => c ?? snapshots[0].id);
    setBaselineId((b) => b ?? (snapshots[1]?.id ?? snapshots[snapshots.length - 1].id));
  }, [snapshots]);

  const compareMut = useMutation({
    mutationFn: async (body: { baselineId: number; currentId: number }) => {
      const res = await apiRequest("POST", `/api/deals/${dealId}/snapshots/compare`, body);
      return res.json() as Promise<CompareResult>;
    },
  });

  useEffect(() => {
    if (baselineId != null && currentId != null) {
      compareMut.mutate({ baselineId, currentId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineId, currentId]);

  const result = compareMut.data;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 pb-28">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(`/deal/${dealId}`)}
          aria-label="Back"
          className="p-2 -ml-2 rounded hover:bg-muted"
          data-testid="button-compare-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Compare snapshots</h1>
      </div>

      {snapshots.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Need at least two snapshots to compare. Refresh the deal to capture a new one.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <SnapshotPicker
              label="Baseline"
              value={baselineId}
              onChange={setBaselineId}
              snapshots={snapshots}
              testId="select-baseline"
            />
            <SnapshotPicker
              label="Current"
              value={currentId}
              onChange={setCurrentId}
              snapshots={snapshots}
              testId="select-current"
            />
          </div>

          {result?.sections.map((section) => (
            <div key={section.name} className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {section.name}
              </p>
              <div className="space-y-2">
                {section.rows.map((row) => (
                  <CompareRowCard key={row.key} row={row} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {result && snapshots.length >= 2 && (
        <div
          className="fixed bottom-0 left-0 right-0 border-t px-4 py-3 text-sm"
          style={{ backgroundColor: "#0a0e12", borderColor: "#1c262f" }}
        >
          <div className="mx-auto max-w-3xl flex items-center justify-between gap-2 flex-wrap">
            <span className="text-muted-foreground">
              <span style={{ color: "#7fd4a8" }}>{result.summary.improved} improved</span>,{" "}
              <span style={{ color: "#e56666" }}>{result.summary.regressed} regressed</span>,{" "}
              {result.summary.unchanged} unchanged.
            </span>
            <span className="font-semibold">
              Deal quality trended{" "}
              <span
                style={{
                  color:
                    result.summary.trend === "UP"
                      ? "#7fd4a8"
                      : result.summary.trend === "DOWN"
                        ? "#e56666"
                        : "#8a97a3",
                }}
              >
                {result.summary.trend}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SnapshotPicker({
  label,
  value,
  onChange,
  snapshots,
  testId,
}: {
  label: string;
  value: number | null;
  onChange: (id: number) => void;
  snapshots: SnapshotListItem[];
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select
        value={value != null ? String(value) : undefined}
        onValueChange={(v) => onChange(Number(v))}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder="Select snapshot" />
        </SelectTrigger>
        <SelectContent>
          {snapshots.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {fmtDateTime(s.createdAt)}
              {s.isOriginal ? " · Original" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CompareRowCard({ row }: { row: CompareRow }) {
  const color = outcomeColor(row.outcome);
  const tint =
    row.outcome === "improved"
      ? "rgba(127,212,168,0.08)"
      : row.outcome === "regressed"
        ? "rgba(229,102,102,0.08)"
        : "transparent";
  // Site-intelligence text rows stash beforeText/afterText on the row.
  const beforeText = (row as unknown as { beforeText?: string | null }).beforeText;
  const afterText = (row as unknown as { afterText?: string | null }).afterText;
  const isText = beforeText !== undefined || afterText !== undefined;
  const chip = deltaLabel(row);

  return (
    <div
      className="rounded-md px-3 py-2.5"
      style={{ backgroundColor: tint, borderLeft: `2px solid ${color}` }}
      data-testid={`compare-row-${row.key}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">{row.label}</span>
        {chip && (
          <span className="text-xs font-semibold tabular-nums" style={{ color }}>
            {chip}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
        {isText ? (
          <span>
            {beforeText ?? "—"} → {afterText ?? "—"}
          </span>
        ) : (
          <span>
            {fmtValue(row.before, row.format)} → {fmtValue(row.after, row.format)}
          </span>
        )}
      </div>
    </div>
  );
}
