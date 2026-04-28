import { useQuery } from "@tanstack/react-query";
import {
  Waves,
  GraduationCap,
  Droplets,
  Network,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type PanelState = "ok" | "info" | "warn" | "stop" | "out-of-scope" | "unknown";

interface PanelData {
  state: PanelState;
  label: string;
  meta: string;
  scope?: string;
}

interface SiteIntel {
  criticalArea: PanelData;
  highSchool: PanelData;
  water: PanelData;
  sewer: PanelData;
}

interface Props {
  lat: number | null | undefined;
  lon: number | null | undefined;
}

// State token map — matches the locked Option 2 design tokens
const stateTokens: Record<
  PanelState,
  {
    bg: string;
    border: string;
    valueColor: string;
    iconBg: string;
    iconColor: string;
    Icon: typeof CheckCircle2;
  }
> = {
  ok: {
    bg: "#f0fdf4",
    border: "#bbf7d0",
    valueColor: "#15803d",
    iconBg: "#dcfce7",
    iconColor: "#15803d",
    Icon: CheckCircle2,
  },
  info: {
    bg: "#eff6ff",
    border: "#bfdbfe",
    valueColor: "#1d4ed8",
    iconBg: "#dbeafe",
    iconColor: "#1d4ed8",
    Icon: Info,
  },
  warn: {
    bg: "#fffbeb",
    border: "#fde68a",
    valueColor: "#b45309",
    iconBg: "#fef3c7",
    iconColor: "#b45309",
    Icon: AlertTriangle,
  },
  stop: {
    bg: "#fef2f2",
    border: "#fecaca",
    valueColor: "#b91c1c",
    iconBg: "#fee2e2",
    iconColor: "#b91c1c",
    Icon: XCircle,
  },
  "out-of-scope": {
    bg: "#f8fafc",
    border: "#e2e8f0",
    valueColor: "#475569",
    iconBg: "#e2e8f0",
    iconColor: "#475569",
    Icon: HelpCircle,
  },
  unknown: {
    bg: "#f8fafc",
    border: "#e2e8f0",
    valueColor: "#475569",
    iconBg: "#e2e8f0",
    iconColor: "#475569",
    Icon: HelpCircle,
  },
};

function StatusPanel({
  panelLabel,
  data,
  PanelIcon,
}: {
  panelLabel: string;
  data: PanelData;
  PanelIcon: typeof Waves;
}) {
  const tokens = stateTokens[data.state] ?? stateTokens.unknown;
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{
        backgroundColor: tokens.bg,
        border: `1px solid ${tokens.border}`,
      }}
      data-testid={`panel-${panelLabel.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 26,
            height: 26,
            backgroundColor: tokens.iconBg,
            color: tokens.iconColor,
          }}
        >
          <PanelIcon size={13} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-semibold uppercase mb-0.5"
            style={{
              fontSize: "9px",
              letterSpacing: "0.08em",
              color: "#6b7480",
              fontFamily:
                "'Satoshi', 'Inter', system-ui, sans-serif",
            }}
          >
            {panelLabel}
            {data.scope && (
              <span style={{ marginLeft: 4, color: "#94a3b8" }}>
                · {data.scope}
              </span>
            )}
          </div>
          <div
            className="font-bold leading-tight"
            style={{
              fontSize: "13.5px",
              letterSpacing: "-0.015em",
              color: tokens.valueColor,
              fontFamily:
                "'General Sans', 'Inter', system-ui, sans-serif",
            }}
          >
            {data.label}
          </div>
        </div>
      </div>
      {data.meta && (
        <div
          className="pt-2 leading-snug"
          style={{
            fontSize: "9.5px",
            color: "#6b7480",
            borderTop: "1px solid rgba(0,0,0,0.06)",
            lineHeight: 1.4,
          }}
        >
          {data.meta}
        </div>
      )}
    </div>
  );
}

function SkeletonPanel({ label }: { label: string }) {
  return (
    <div
      className="rounded-lg p-3 flex items-center gap-2.5"
      style={{
        backgroundColor: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        className="flex items-center justify-center rounded-full shrink-0"
        style={{ width: 26, height: 26, backgroundColor: "#e2e8f0" }}
      >
        <Loader2 size={13} className="animate-spin" color="#94a3b8" />
      </div>
      <div className="flex-1">
        <div
          style={{
            fontSize: "9px",
            letterSpacing: "0.08em",
            color: "#94a3b8",
            fontFamily: "'Satoshi', 'Inter', sans-serif",
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div className="h-3 mt-1 w-3/5 rounded" style={{ backgroundColor: "#e2e8f0" }} />
      </div>
    </div>
  );
}

export function SiteIntelligence({ lat, lon }: Props) {
  const enabled =
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon);

  const { data, isLoading, isError } = useQuery<SiteIntel>({
    queryKey: ["/api/site-intelligence", lat, lon],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/site-intelligence?lat=${lat}&lon=${lon}`,
      );
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  // Count "returned" panels (anything not unknown/error)
  const returnedCount = data
    ? [data.criticalArea, data.highSchool, data.water, data.sewer].filter(
        (p) => p && p.state !== "unknown",
      ).length
    : 0;

  if (!enabled) {
    return null;
  }

  return (
    <div
      className="rounded-xl p-4 mb-5"
      style={{
        background:
          "linear-gradient(180deg, #ffffff 0%, #fafbfc 100%)",
        border: "1px solid hsl(var(--card-border))",
      }}
      data-testid="site-intelligence"
    >
      <div className="flex items-baseline justify-between mb-3">
        <h3
          className="font-semibold uppercase"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.16em",
            color: "#475569",
            fontFamily: "'Satoshi', 'Inter', sans-serif",
          }}
        >
          Site Intelligence
        </h3>
        <span
          className="font-medium"
          style={{
            fontSize: "10.5px",
            letterSpacing: "0.04em",
            color: "#94a3b8",
            fontFamily: "'Satoshi', 'Inter', sans-serif",
          }}
          data-testid="text-site-intel-count"
        >
          {isLoading
            ? "Checking 4 sources…"
            : isError
              ? "Lookup failed"
              : `${returnedCount} of 4 returned`}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {isLoading || !data ? (
          <>
            <SkeletonPanel label="Critical Area · AACO+Calvert" />
            <SkeletonPanel label="High School Zone" />
            <SkeletonPanel label="Water Service" />
            <SkeletonPanel label="Sewer Service" />
          </>
        ) : (
          <>
            <StatusPanel
              panelLabel="Critical Area"
              data={data.criticalArea}
              PanelIcon={Waves}
            />
            <StatusPanel
              panelLabel="High School Zone"
              data={data.highSchool}
              PanelIcon={GraduationCap}
            />
            <StatusPanel
              panelLabel="Water Service"
              data={data.water}
              PanelIcon={Droplets}
            />
            <StatusPanel
              panelLabel="Sewer Service"
              data={data.sewer}
              PanelIcon={Network}
            />
          </>
        )}
      </div>
    </div>
  );
}
