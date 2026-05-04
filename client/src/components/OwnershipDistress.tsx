import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Gavel, ShieldAlert, User as UserIcon, Calendar, Building2 } from "lucide-react";

type DistressStatus =
  | "preforeclosure"
  | "lis_pendens"
  | "nod"
  | "auction"
  | "reo"
  | "none";

interface DistressResult {
  status: DistressStatus;
  details: {
    recordingDate?: string | null;
    auctionDate?: string | null;
    caseNumber?: string | null;
    defaultAmount?: number | null;
  };
}

interface OwnershipResult {
  owner: {
    names: string[];
    mailingAddress: string | null;
    absentee: boolean | null;
    ownerOccupied: boolean | null;
  } | null;
  lastSale: {
    date: string | null;
    price: number | null;
    grantor: string | null;
    grantee: string | null;
  } | null;
  saleHistory: Array<{
    date: string | null;
    price: number | null;
    grantor: string | null;
    grantee: string | null;
  }>;
  mortgage: {
    lender: string | null;
    originalAmount: number | null;
    recordingDate: string | null;
  } | null;
}

const fmtUSD = (n: number | null | undefined) =>
  n != null && Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Distress status → label + tone. Orange = early-stage; red = imminent / hot lead.
const STATUS_META: Record<
  Exclude<DistressStatus, "none">,
  { label: string; tone: "orange" | "red" }
> = {
  preforeclosure: { label: "Pre-foreclosure", tone: "orange" },
  nod: { label: "Notice of Default", tone: "orange" },
  lis_pendens: { label: "Lis Pendens", tone: "red" },
  auction: { label: "Auction Scheduled", tone: "red" },
  reo: { label: "Bank-Owned (REO)", tone: "red" },
};

// Fetch + tolerate 503/404. Both are "hide the section" outcomes — we don't
// surface ATTOM errors as a broken UI. 503 means the key isn't set yet.
async function fetchSilent<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function OwnershipDistress({
  address,
  subjectAddress,
}: {
  address: string;
  // Subject address for owner-occupied vs absentee comparison when ATTOM
  // doesn't return a clean flag. We pass the deal address from the page.
  subjectAddress?: string | null;
}) {
  const distress = useQuery<DistressResult | null>({
    queryKey: ["/api/property/distress", address],
    queryFn: () =>
      fetchSilent<DistressResult>(
        `/api/property/distress?address=${encodeURIComponent(address)}`
      ),
    enabled: !!address,
    staleTime: 6 * 60 * 60 * 1000,
  });

  const ownership = useQuery<OwnershipResult | null>({
    queryKey: ["/api/property/ownership", address],
    queryFn: () =>
      fetchSilent<OwnershipResult>(
        `/api/property/ownership?address=${encodeURIComponent(address)}`
      ),
    enabled: !!address,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Loading shimmer until both have settled.
  if (distress.isLoading || ownership.isLoading) {
    return (
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="h-3 w-24 rounded bg-muted/60 animate-pulse mb-3" />
          <div className="h-4 w-48 rounded bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const d = distress.data;
  const o = ownership.data;

  // If ATTOM returned nothing useful AND the call wasn't auth-failing, hide the
  // section entirely save for a quiet note. We treat "no owner + no sale + no
  // distress signal" as "no record". 503 (key missing) → both null → hide.
  const hasDistress = d && d.status !== "none";
  const hasOwner = !!o?.owner && o.owner.names.length > 0;
  const hasLastSale = !!o?.lastSale && (o.lastSale.date || o.lastSale.price);
  const hasMortgage = !!o?.mortgage && (o.mortgage.lender || o.mortgage.originalAmount);

  if (!hasDistress && !hasOwner && !hasLastSale && !hasMortgage) {
    // If both queries returned null (e.g. ATTOM_API_KEY missing or 503), don't
    // even show the placeholder — keep the page clean.
    if (!d && !o) return null;
    return (
      <p className="mb-8 text-[11px] text-muted-foreground italic">
        Public records unavailable for this address.
      </p>
    );
  }

  // Determine absentee — prefer ATTOM's flag; fall back to comparing addresses.
  let absentee = o?.owner?.absentee ?? null;
  if (absentee == null && o?.owner?.mailingAddress && subjectAddress) {
    absentee =
      o.owner.mailingAddress.trim().toLowerCase() !==
      subjectAddress.trim().toLowerCase();
  }

  return (
    <Card className="mb-8 glass-card" data-testid="card-ownership-distress">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="h-4 w-4 text-accent" />
          <span className="mono-eyebrow text-[11px] tracking-[0.18em]">
            Ownership &amp; Distress
          </span>
        </div>

        {hasDistress && d && (
          <DistressBadge
            status={d.status as Exclude<DistressStatus, "none">}
            details={d.details}
          />
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {hasOwner && o?.owner && (
            <div>
              <div className="mono-eyebrow text-[10px] tracking-[0.18em] mb-1.5 inline-flex items-center gap-1.5">
                <UserIcon className="h-3 w-3" /> Owner
              </div>
              <div className="text-sm font-medium" data-testid="text-attom-owner">
                {o.owner.names.join(" · ")}
              </div>
              {absentee != null && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {absentee ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30 px-1.5 py-0.5 font-medium">
                      Absentee owner
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Owner-occupied</span>
                  )}
                </div>
              )}
              {absentee && o.owner.mailingAddress && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Mail: {o.owner.mailingAddress}
                </div>
              )}
            </div>
          )}

          {hasLastSale && o?.lastSale && (
            <div>
              <div className="mono-eyebrow text-[10px] tracking-[0.18em] mb-1.5 inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Last sale
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {fmtUSD(o.lastSale.price)}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {fmtDate(o.lastSale.date)}
              </div>
            </div>
          )}

          {hasMortgage && o?.mortgage && (
            <div className="sm:col-span-2">
              <div className="mono-eyebrow text-[10px] tracking-[0.18em] mb-1.5 inline-flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> Open mortgage
              </div>
              <div className="text-sm font-medium">{o.mortgage.lender ?? "Lender unknown"}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {o.mortgage.originalAmount != null
                  ? `${fmtUSD(o.mortgage.originalAmount)} · `
                  : ""}
                Recorded {fmtDate(o.mortgage.recordingDate)}
              </div>
            </div>
          )}
        </div>

        <p className="pt-3 mt-4 border-t border-card-border text-[10px] text-muted-foreground">
          Public records via ATTOM Data Solutions · may lag county recording by days
        </p>
      </CardContent>
    </Card>
  );
}

function DistressBadge({
  status,
  details,
}: {
  status: Exclude<DistressStatus, "none">;
  details: DistressResult["details"];
}) {
  const meta = STATUS_META[status];
  const tone =
    meta.tone === "red"
      ? "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/40"
      : "bg-orange-500/10 text-orange-700 dark:text-orange-300 ring-orange-500/40";
  const Icon = meta.tone === "red" ? Gavel : AlertTriangle;
  const dateLine =
    details.auctionDate
      ? `Auction ${fmtDate(details.auctionDate)}`
      : details.recordingDate
        ? `Filed ${fmtDate(details.recordingDate)}`
        : null;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 ring-1 text-xs font-medium ${tone}`}
      data-testid={`badge-distress-${status}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{meta.label}</span>
      {dateLine && (
        <span className="opacity-80 tabular-nums">· {dateLine}</span>
      )}
      {details.defaultAmount != null && (
        <span className="opacity-80 tabular-nums">· {fmtUSD(details.defaultAmount)}</span>
      )}
    </div>
  );
}
