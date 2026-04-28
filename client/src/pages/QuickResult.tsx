import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal, type DealInputs } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import { MapPreview } from "@/components/MapPreview";
import { SiteIntelligence } from "@/components/SiteIntelligence";
import { PropertyProfile } from "@/components/PropertyProfile";
import { CompsMap, type CompPin } from "@/components/CompsMap";
import {
  TrendingUp,
  TrendingDown,
  MapPin,
  ArrowLeft,
  Sparkles,
  Coins,
  Calendar,
  Wallet,
  Target,
  RotateCcw,
  ChevronRight,
  ArrowUpRight,
  Home as HomeIcon,
  FileDown,
  Eye,
  EyeOff,
  Pencil,
  Mail,
} from "lucide-react";
import { exportDealPdf, exportDealPdfBlob } from "@/lib/exportPdf";
import { EmailPdfDialog } from "@/components/EmailPdfDialog";
import { useState, useEffect, useRef } from "react";
import CountUp from "react-countup";

export default function QuickResult() {
  const [, params] = useRoute("/result/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ["/api/deals", id],
    enabled: Number.isFinite(id),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/deals/${id}`);
      return res.json();
    },
  });

  const updateDeal = useMutation({
    mutationFn: async (vars: {
      inputs?: DealInputs;
      notes?: string | null;
      name?: string | null;
      pinned?: boolean;
      archived?: boolean;
    }) => {
      const body: Record<string, unknown> = {};
      if (vars.inputs !== undefined) body.inputs = JSON.stringify(vars.inputs);
      if (vars.notes !== undefined) body.notes = vars.notes;
      if (vars.name !== undefined) body.name = vars.name;
      if (vars.pinned !== undefined) body.pinned = vars.pinned;
      if (vars.archived !== undefined) body.archived = vars.archived;
      const res = await apiRequest("PATCH", `/api/deals/${id}`, body);
      return res.json() as Promise<Deal>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    },
  });

  const [emailOpen, setEmailOpen] = useState(false);

  if (isLoading || !deal) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-14 text-center text-sm text-muted-foreground">
        Loading deal…
      </div>
    );
  }

  const inputs: DealInputs = (() => {
    try {
      return { ...defaultDealInputs, ...JSON.parse(deal.inputs) };
    } catch {
      return defaultDealInputs;
    }
  })();
  const r = calculateDeal(inputs, { state: deal.state, city: deal.city });
  const profitable = r.netProfit > 0;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          data-testid="button-home"
          className="-ml-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Home
        </Button>
        <Link href="/quick">
          <Button variant="outline" size="sm" data-testid="button-new-deal">
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Analyze another
          </Button>
        </Link>
      </div>

      {/* Address card */}
      <div className="mb-6 flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <DealNameEditor
            currentName={deal.name ?? null}
            fallback={deal.address}
            isSaving={updateDeal.isPending}
            onSave={(name) => updateDeal.mutate({ name })}
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            {deal.city ? `${deal.address} · ${deal.city}, ${deal.state} ${deal.zip ?? ""}` : deal.address}
          </p>
          {/* Property facts strip — shows what the analysis is built on */}
          {/* (note: bare deal.city block removed; combined into the line above) */}
          {(deal.sqft || deal.beds != null || deal.baths != null || deal.yearBuilt) && (
            <div
              className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums"
              data-testid="text-property-facts"
            >
              {deal.sqft ? (
                <span className="font-semibold text-foreground">
                  {deal.sqft.toLocaleString()} sqft
                </span>
              ) : null}
              {deal.beds != null && (
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{deal.beds}</span> bd
                </span>
              )}
              {deal.baths != null && (
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{deal.baths}</span> ba
                </span>
              )}
              {deal.yearBuilt && (
                <span className="text-muted-foreground">
                  Built <span className="font-semibold text-foreground">{deal.yearBuilt}</span>
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {inputs.isTeardown && (
              <span
                className="inline-flex items-center rounded-md bg-destructive/15 text-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-destructive/30"
                data-testid="badge-teardown"
              >
                Teardown
              </span>
            )}
            {inputs.lotAcres != null && inputs.lotAcres > 0 && (
              <span
                className="text-[11px] text-muted-foreground tabular-nums"
                data-testid="text-lot-size"
              >
                Lot: {inputs.lotAcres.toFixed(3)} ac
                {inputs.lotSqft != null && inputs.lotSqft > 0 && (
                  <> / {inputs.lotSqft.toLocaleString()} sqft</>
                )}
              </span>
            )}
            {!deal.sqft && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                Sqft unavailable — ARV used median sale price
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Profit hero — ultra-modern: deep indigo, aurora glow, animated odometer */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="aurora-hero"
      >
        <Card
          className={`overflow-hidden border-0 relative ${
            profitable
              ? "bg-[hsl(246_38%_8%)]"
              : "bg-gradient-to-br from-destructive to-destructive/85"
          }`}
        >
          {profitable && (
            <div className="absolute inset-0 grid-overlay opacity-40 pointer-events-none" />
          )}
          <CardContent className="p-7 sm:p-12 text-white relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/70">
                {profitable ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))] shadow-[0_0_10px_hsl(var(--success))]" />
                    Estimated profit
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3.5 w-3.5" />
                    Projected loss
                  </>
                )}
              </div>
              {profitable && (
                <div className="hidden sm:flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  PropBoxIQ
                  <span className="h-1 w-1 rounded-full bg-white/40" />
                  v1
                </div>
              )}
            </div>
            <div
              className="font-display text-[3.25rem] sm:text-[5.5rem] font-semibold tracking-[-0.04em] leading-none tabular-nums mb-6"
              data-testid="text-profit"
            >
              {profitable ? (
                <CountUp
                  end={r.netProfit}
                  duration={1.4}
                  separator=","
                  prefix="$"
                  preserveValue
                />
              ) : (
                fmtUSD(r.netProfit)
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-4 pt-5 border-t border-white/10">
              <HeroStat label="ROI / cash" value={r.roiOnCash} suffix="%" decimals={1} />
              <HeroStat label="Margin" value={r.profitMarginPct} suffix="%" decimals={1} />
              <HeroStat
                label="Annualized"
                value={r.annualizedRoi}
                suffix="%"
                decimals={1}
              />
              <HeroStat
                label="LTC"
                value={
                  inputs.purchasePrice + r.totalRehab > 0
                    ? (r.loanAmount / (inputs.purchasePrice + r.totalRehab)) *
                      100
                    : 0
                }
                suffix="%"
                decimals={1}
              />
              <HeroStat
                label="LTV (ARV)"
                value={
                  inputs.arv > 0 ? (r.loanAmount / inputs.arv) * 100 : 0
                }
                suffix="%"
                decimals={1}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Verdict */}
      <Verdict r={r} inputs={inputs} />

      {/* Key numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <KpiCard
          icon={<Coins className="h-4 w-4" />}
          label="Total cash needed"
          value={fmtUSD(r.totalCashInvested)}
          hint="Out-of-pocket from your wallet"
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="Max offer (15% target)"
          value={fmtUSD(r.maxAllowableOffer)}
          hint="Don't pay more than this"
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total project cost"
          value={fmtUSD(r.totalProjectCost)}
          hint="All-in cost incl. financing"
        />
        <KpiCard
          icon={<Calendar className="h-4 w-4" />}
          label="Hold period"
          value={`${inputs.holdingMonths} mo`}
          hint="Default — adjust in Detailed mode"
        />
      </div>

      {/* Site Intelligence — 4 GIS panels (Critical Area, High School, Water, Sewer) */}
      <SiteIntelligence lat={deal.lat ?? null} lon={deal.lon ?? null} />

      {/* Comps used — only when an auto-comp pull was saved on the deal */}
      <CompsSection
        deal={deal}
        onUpdateNotes={(notes) => updateDeal.mutate({ notes })}
        isSaving={updateDeal.isPending}
      />

      {/* Full property profile — county, zoning, owner, sale history, rent estimate, market stats */}
      <PropertyProfile address={deal.address} zip={deal.zip ?? null} />

      {/* Sources & uses + map (asymmetric: 3/5 + 2/5) */}
      <div className="grid gap-5 lg:grid-cols-5 mb-8">
        <Card className="lg:col-span-3">
          <CardContent className="p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="font-display text-base font-semibold tracking-tight">Where the money goes</h3>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Sources · Uses
              </span>
            </div>
            <Breakdown inputs={inputs} r={r} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 overflow-hidden">
          {deal.lat && deal.lon ? (
            <MapPreview lat={deal.lat} lon={deal.lon} />
          ) : (
            <div className="aspect-[4/3] flex items-center justify-center text-xs text-muted-foreground">
              No map preview available
            </div>
          )}
        </Card>
      </div>

      {/* Live what-if mini sliders */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Quick what-if</h3>
              <p className="text-xs text-muted-foreground">
                Tweak the numbers and watch profit update.
              </p>
            </div>
            {updateDeal.isPending && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
          </div>
          <WhatIf
            inputs={inputs}
            onChange={(next) => updateDeal.mutate({ inputs: next })}
          />
        </CardContent>
      </Card>

      {/* Export / Email PDF */}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportDealPdf(deal, inputs)}
          data-testid="button-export-pdf"
        >
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEmailOpen(true)}
          data-testid="button-email-pdf"
        >
          <Mail className="h-4 w-4 mr-2" />
          Email
        </Button>
      </div>

      <EmailPdfDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        getPdf={() => exportDealPdfBlob(deal, inputs)}
        defaultSubject={`Deal memo: ${deal.name?.trim() || deal.address}`}
        defaultMessage={[
          `Sharing the deal memo for ${deal.address}.`,
          ``,
          `ARV: ${fmtUSD(inputs.arv)}`,
          `Estimated profit: ${fmtUSD(r.netProfit)}`,
          `ROI: ${fmtPct(r.roiOnCash)}`,
          ``,
          `Full breakdown attached.`,
        ].join("\n")}
      />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Want full control over financing, holding costs, and sensitivity?{" "}
        <Link
          href={`/deal/${deal.id}`}
          className="text-foreground underline hover:text-accent"
          data-testid="link-detailed"
        >
          Open in Detailed mode
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider opacity-75">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// Saved comps payload type — `lat`/`lon` come from the server even though early
// versions of this type didn't include them.
type SavedComp = {
  id: string;
  address: string;
  price: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  distance: number;
  daysOld: number;
  pricePerSqft: number | null;
  lat?: number | null;
  lon?: number | null;
};

type SavedCompsData = {
  arv: number;
  arvLow: number;
  arvHigh: number;
  medianPricePerSqft: number | null;
  arvMethod?: string;
  arvAnchorPpsf?: number | null;
  arvTopCompIds?: string[];
  compCount: number;
  radiusMiles: number | null;
  subject: { address: string; sqft: number | null };
  target?: {
    sqft: number | null;
    beds: number | null;
    baths: number | null;
  };
  quality?: {
    level: "good" | "wide" | "low";
    message: string | null;
    standardMaxRadius: number;
    minComps: number;
  };
  filters?: {
    sqftTolerance: number;
    daysOld: number;
    targetBedsTolerance: number | null;
    targetBathsTolerance: number | null;
  };
  comps: SavedComp[];
};

// Full notes envelope including user-edited overrides (excluded comps).
type CompsNotesEnvelope = {
  kind: "comps";
  version: number;
  compsData: SavedCompsData;
  excludedCompIds?: string[]; // user-excluded comps (added in v2)
};

// Read the saved comps payload from the deal's notes JSON envelope. Returns
// null when notes is missing, malformed, or not a comps payload (e.g. plain text).
function parseSavedCompsEnvelope(notes: string | null): CompsNotesEnvelope | null {
  if (!notes) return null;
  try {
    const obj = JSON.parse(notes);
    if (obj?.kind !== "comps" || !obj?.compsData) return null;
    return obj as CompsNotesEnvelope;
  } catch {
    return null;
  }
}

// Backward-compat shim used elsewhere
function parseSavedComps(notes: string | null): SavedCompsData | null {
  return parseSavedCompsEnvelope(notes)?.compsData ?? null;
}

function CompsSection({
  deal,
  onUpdateNotes,
  isSaving,
}: {
  deal: Deal;
  onUpdateNotes: (notes: string | null) => void;
  isSaving: boolean;
}) {
  const envelope = parseSavedCompsEnvelope(deal.notes ?? null);
  const data = envelope?.compsData;

  // Local exclusion state — hydrated from the saved envelope, mutated locally,
  // then persisted back to the deal via PATCH.
  const initialExcluded = envelope?.excludedCompIds ?? [];
  const [excludedIds, setExcludedIds] = useState<Set<string>>(
    () => new Set(initialExcluded),
  );

  // Re-hydrate when the deal's notes change (e.g. after a successful PATCH
  // round-trips through React Query). Strict equality on Sets isn't useful so
  // we sync via the underlying array.
  useEffect(() => {
    setExcludedIds(new Set(envelope?.excludedCompIds ?? []));
    // We intentionally key off the stringified IDs to avoid loops when the
    // local Set is the source of truth between server round-trips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(envelope?.excludedCompIds ?? [])]);

  if (!data) return null;

  // Recompute Top-4 / ARV from non-excluded comps. Mirrors server logic.
  const activeComps = data.comps.filter((c) => !excludedIds.has(c.id));
  const topIds = new Set(
    [...activeComps].sort((a, b) => b.price - a.price).slice(0, 4).map((c) => c.id),
  );
  const topComps = activeComps.filter((c) => topIds.has(c.id));
  const liveAnchorPpsf = (() => {
    const list = topComps
      .map((c) => c.pricePerSqft)
      .filter((n): n is number => n != null);
    if (list.length === 0) return null;
    return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  })();
  const arvSqft = data.target?.sqft ?? data.subject.sqft;
  const liveArv = (() => {
    if (arvSqft && liveAnchorPpsf) return Math.round(arvSqft * liveAnchorPpsf);
    if (topComps.length === 0) return data.arv; // fallback to original
    return Math.round(
      topComps.reduce((a, b) => a + b.price, 0) / topComps.length,
    );
  })();
  const liveBand = activeComps.length >= 6 ? 0.07 : 0.1;
  const liveLow = Math.round(liveArv * (1 - liveBand));
  const liveHigh = Math.round(liveArv * (1 + liveBand));
  const isOverridden = excludedIds.size > 0;

  // Toggle one comp's exclusion. Persists immediately so the change survives reloads.
  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Persist asynchronously
      persist(next);
      return next;
    });
  };
  const resetExclusions = () => {
    setExcludedIds(new Set());
    persist(new Set());
  };
  const persist = (set: Set<string>) => {
    const nextEnvelope: CompsNotesEnvelope = {
      kind: "comps",
      version: envelope?.version ?? 1,
      compsData: data,
      excludedCompIds: Array.from(set),
    };
    onUpdateNotes(JSON.stringify(nextEnvelope));
  };

  // Build map pins (sequential numbering matches the visible list order).
  const sortedComps = [...data.comps].sort((a, b) => {
    const aActive = excludedIds.has(a.id) ? 0 : 1;
    const bActive = excludedIds.has(b.id) ? 0 : 1;
    if (aActive !== bActive) return bActive - aActive;
    const aTop = topIds.has(a.id) ? 1 : 0;
    const bTop = topIds.has(b.id) ? 1 : 0;
    if (aTop !== bTop) return bTop - aTop;
    return b.price - a.price;
  });
  const pins: CompPin[] = sortedComps.map((c) => ({
    id: c.id,
    address: c.address,
    price: c.price,
    sqft: c.sqft,
    pricePerSqft: c.pricePerSqft,
    distance: c.distance,
    lat: c.lat ?? null,
    lon: c.lon ?? null,
    isTop: topIds.has(c.id),
    excluded: excludedIds.has(c.id),
  }));
  const hasMapCoords =
    deal.lat != null &&
    deal.lon != null &&
    pins.some((p) => p.lat != null && p.lon != null);

  // Filter chip strip
  const sqftTolerancePct = Math.round((data.filters?.sqftTolerance ?? 0.15) * 100);
  const daysOldMonths = Math.round((data.filters?.daysOld ?? 180) / 30);
  const radiusLabel = data.radiusMiles
    ? data.radiusMiles < 1
      ? `${data.radiusMiles} mi`
      : `${data.radiusMiles.toFixed(2)} mi`
    : "—";

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="font-display text-base font-semibold tracking-tight">
                Comps used
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Recent sold + active comparables that informed this ARV
            </p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {activeComps.length} comps · {radiusLabel}
          </span>
        </div>

        {/* Filter transparency strip */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <FilterChip>{radiusLabel} radius</FilterChip>
          <FilterChip>±{sqftTolerancePct}% sqft</FilterChip>
          <FilterChip>last {daysOldMonths} mo</FilterChip>
          {data.filters?.targetBedsTolerance != null && (
            <FilterChip>±1 bed</FilterChip>
          )}
          {data.filters?.targetBathsTolerance != null && (
            <FilterChip>±1 bath</FilterChip>
          )}
          {data.target?.sqft && (
            <FilterChip>matched to post-rehab</FilterChip>
          )}
        </div>

        {data.quality && data.quality.level !== "good" && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex items-start gap-2.5">
            <div className="h-4 w-4 rounded-full bg-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-amber-300 text-[10px] font-bold leading-none">!</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                {data.quality.level === "low"
                  ? "Limited comp data"
                  : "Wide comp search"}
              </p>
              <p className="text-xs text-amber-100/90 mt-0.5">
                {data.quality.message ??
                  "Comp quality is limited — review carefully."}
              </p>
            </div>
          </div>
        )}

        {/* Map */}
        {hasMapCoords && (
          <div className="mb-5">
            <CompsMap
              subject={{
                lat: deal.lat ?? null,
                lon: deal.lon ?? null,
                address: deal.address,
              }}
              comps={pins}
              radiusMiles={data.radiusMiles ?? null}
            />
            <p className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#126D85]" />
              top-4 used for ARV
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-white border border-[#126D85] ml-2" />
              other comps
              <span className="ml-2">· dotted ring = search radius</span>
            </p>
          </div>
        )}

        {/* ARV stats — with override indicator */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <CompStat
            label={isOverridden ? "Adjusted ARV" : "Auto ARV"}
            value={fmtUSD(liveArv)}
            accent
          />
          <CompStat
            label="Range"
            value={`${fmtUSD(liveLow)} – ${fmtUSD(liveHigh)}`}
          />
          <CompStat
            label={liveAnchorPpsf ? "Top-4 $/sqft" : "Median $/sqft"}
            value={
              liveAnchorPpsf
                ? `$${liveAnchorPpsf}`
                : data.medianPricePerSqft
                  ? `$${data.medianPricePerSqft}`
                  : "—"
            }
          />
        </div>

        {/* Override banner */}
        {isOverridden && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                {excludedIds.size} comp{excludedIds.size === 1 ? "" : "s"} excluded
              </p>
              <p className="text-xs text-amber-100/90 mt-0.5">
                ARV recalculated from the remaining top {Math.min(4, topComps.length)}.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetExclusions}
              disabled={isSaving}
              className="shrink-0 text-amber-200 hover:bg-amber-500/20"
              data-testid="button-reset-comp-exclusions"
            >
              Reset
            </Button>
          </div>
        )}

        {/* Comp list with exclude toggle */}
        <ul className="divide-y divide-card-border border border-card-border rounded-lg overflow-hidden">
          {sortedComps.map((c, i) => {
            const isTop = topIds.has(c.id);
            const isExcluded = excludedIds.has(c.id);
            // Pin number matches map (1-indexed, in display order)
            const pinN = i + 1;
            return (
              <li
                key={c.id}
                className={`px-4 py-3 flex items-center gap-3 ${
                  isExcluded
                    ? "bg-muted/20 opacity-60"
                    : isTop
                      ? "bg-accent/5"
                      : ""
                }`}
                data-testid={`comp-row-${c.id}`}
              >
                <span
                  className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                    isTop
                      ? "bg-[#126D85] text-white"
                      : "border border-[#126D85] text-[#5fd4e7] bg-transparent"
                  } ${isExcluded ? "line-through" : ""}`}
                >
                  {pinN}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p
                      className={`text-sm font-medium truncate ${
                        isExcluded ? "line-through" : ""
                      }`}
                    >
                      {c.address}
                    </p>
                    {isTop && !isExcluded && (
                      <span className="text-[9px] font-bold uppercase tracking-[0.12em] bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                        ARV
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {c.sqft ? `${c.sqft.toLocaleString()} sqft` : "—"}
                    {c.beds != null && c.baths != null
                      ? ` · ${c.beds}bd/${c.baths}ba`
                      : ""}
                    {" · "}
                    {c.distance.toFixed(2)} mi
                    {" · "}
                    {c.daysOld <= 1 ? "today" : `${c.daysOld}d ago`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`text-sm tabular-nums ${
                      isExcluded
                        ? "line-through"
                        : isTop
                          ? "font-bold"
                          : "font-semibold"
                    }`}
                  >
                    {fmtUSD(c.price)}
                  </p>
                  {c.pricePerSqft && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      ${c.pricePerSqft}/sqft
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleExclude(c.id)}
                  disabled={isSaving}
                  className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                    isExcluded
                      ? "text-amber-400 hover:bg-amber-500/15"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  } disabled:opacity-50`}
                  aria-label={isExcluded ? "Include comp" : "Exclude comp"}
                  title={isExcluded ? "Include comp" : "Exclude comp"}
                  data-testid={`button-toggle-comp-${c.id}`}
                >
                  {isExcluded ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-[11px] text-muted-foreground">
          ARV = mean $/sqft of the 4 highest-priced comps × subject sqft. ±{sqftTolerancePct}% sqft, last {daysOldMonths} mo, cascading radius. Tap the eye icon to exclude a comp — ARV recalculates from the remaining top 4. Comps powered by RentCast.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Inline-editable nickname for a deal. Click the title to edit; Enter / blur
 * saves; Escape cancels. Empty string clears the nickname (falls back to address).
 */
function DealNameEditor({
  currentName,
  fallback,
  isSaving,
  onSave,
}: {
  currentName: string | null;
  fallback: string;
  isSaving: boolean;
  onSave: (name: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentName ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const display = currentName?.trim() || fallback;

  useEffect(() => {
    setDraft(currentName ?? "");
  }, [currentName]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    // Only persist if the value actually changed
    if ((next || null) !== (currentName?.trim() || null)) {
      onSave(next === "" ? null : next);
    }
  };
  const cancel = () => {
    setDraft(currentName ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        maxLength={120}
        placeholder={fallback}
        disabled={isSaving}
        className="w-full bg-transparent border-b border-accent/60 text-sm font-medium leading-snug focus:outline-none focus:border-accent px-0 py-0.5"
        data-testid="input-deal-name"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 text-left max-w-full hover-elevate active-elevate-2 rounded -mx-1 px-1 py-0.5"
      data-testid="button-edit-deal-name"
      aria-label="Edit deal name"
    >
      <span className="text-sm font-medium leading-snug truncate">{display}</span>
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
    </button>
  );
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wide rounded-full border border-card-border bg-secondary/40 px-2 py-0.5 text-muted-foreground">
      {children}
    </span>
  );
}

function CompStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent
          ? "border-accent/40 bg-accent/5"
          : "border-card-border bg-card/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p
        className={`text-sm font-semibold tabular-nums mt-0.5 ${
          accent ? "text-foreground" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function HeroStat({
  label,
  value,
  suffix,
  decimals = 0,
}: {
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/55 mb-1">
        {label}
      </div>
      <div className="font-display text-base sm:text-lg font-semibold tabular-nums text-white tracking-tight">
        <CountUp
          end={value}
          duration={1.6}
          decimals={decimals}
          suffix={suffix ?? ""}
          preserveValue
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
          {icon}
          {label}
        </div>
        <div className="font-display text-lg font-semibold tabular-nums tracking-tight">{value}</div>
        {hint && (
          <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Verdict({
  r,
  inputs,
}: {
  r: ReturnType<typeof calculateDeal>;
  inputs: DealInputs;
}) {
  const profitable = r.netProfit > 0;
  const roi = r.roiOnCash;
  const margin = r.profitMarginPct;

  let tone: "good" | "ok" | "bad" = "bad";
  let headline = "This deal needs work";
  let body =
    "At these numbers it would lose money. Try lowering your purchase price or increasing the ARV.";

  if (profitable && margin >= 15 && roi >= 25) {
    tone = "good";
    headline = "Strong deal";
    body = `${fmtPct(margin)} profit margin and ${fmtPct(
      roi
    )} ROI on your cash — well above typical investor targets.`;
  } else if (profitable && margin >= 8) {
    tone = "ok";
    headline = "Workable, but tight";
    body = `${fmtPct(
      margin
    )} margin gives some cushion, but most flippers target 15%+. Negotiate harder on price.`;
  } else if (profitable) {
    tone = "ok";
    headline = "Razor thin";
    body = `Only ${fmtPct(
      margin
    )} margin. One surprise on rehab costs and this turns negative.`;
  }

  const colors =
    tone === "good"
      ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5"
      : tone === "ok"
        ? "border-accent/30 bg-accent/5"
        : "border-destructive/30 bg-destructive/5";

  const Icon = tone === "good" ? TrendingUp : tone === "ok" ? Sparkles : TrendingDown;
  const iconColor =
    tone === "good"
      ? "text-[hsl(var(--success))]"
      : tone === "ok"
        ? "text-accent"
        : "text-destructive";

  return (
    <div
      className={`my-6 rounded-lg border ${colors} p-4 flex items-start gap-3`}
      data-testid="verdict"
    >
      <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor}`} />
      <div>
        <div className="text-sm font-semibold">{headline}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function Breakdown({
  inputs,
  r,
}: {
  inputs: DealInputs;
  r: ReturnType<typeof calculateDeal>;
}) {
  // Agent commission split out so the expandable "Closing costs (sale)" only
  // contains the closing-cost line items (not commission).
  const sellClosingTotal = r.totalSellCosts - r.agentCommission;

  const cc = r.closingCosts;
  const buyItems = cc?.buy.items ?? [];
  const sellItems = cc?.sell.items ?? [];

  type Row =
    | { kind: "flat"; label: string; value: number; tone: SegmentTone }
    | {
        kind: "expandable";
        label: string;
        value: number;
        tone: SegmentTone;
        items: { label: string; amount: number; note?: string }[];
        emptyHint?: string;
      };

  const rows: Row[] = [
    { kind: "flat", label: "Purchase price", value: inputs.purchasePrice, tone: "primary" },
    { kind: "flat", label: "Rehab + 10% buffer", value: r.totalRehab, tone: "rehab" },
    {
      kind: "expandable",
      label: "Closing costs (purchase)",
      value: r.buyClosing,
      tone: "buy-close",
      items: buyItems,
      emptyHint: "Add a state to see the local breakdown.",
    },
    { kind: "flat", label: "Financing", value: r.totalFinancingCost, tone: "financing" },
    { kind: "flat", label: "Holding", value: r.totalHoldingCost, tone: "holding" },
    {
      kind: "expandable",
      label: "Closing costs (sale)",
      value: sellClosingTotal,
      tone: "sell-close",
      items: sellItems,
      emptyHint: "Add a state to see the local breakdown.",
    },
    { kind: "flat", label: "Agent commission", value: r.agentCommission, tone: "commission" },
  ];
  const total = r.totalProjectCost;
  const arv = inputs.arv;
  // Profit segment for the bar (only shown when arv > total).
  const profit = Math.max(0, arv - total);
  const denom = Math.max(arv, total);

  return (
    <div>
      {/* Stacked horizontal flow bar — the distinctive dataviz: cost segments, then profit. */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
          <span>Project cost → ARV</span>
          <span className="tabular-nums text-foreground">
            {fmtUSD(total)} <span className="text-muted-foreground">/</span> {fmtUSD(arv)}
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-secondary overflow-hidden flex">
          {rows.map((row, i) => {
            const pct = denom > 0 ? (row.value / denom) * 100 : 0;
            return (
              <motion.div
                key={row.label}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className={`h-full ${segmentColor(row.tone)}`}
                title={`${row.label}: ${fmtUSD(row.value)}`}
              />
            );
          })}
          {profit > 0 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(profit / denom) * 100}%` }}
              transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="h-full bg-[hsl(var(--success))]"
              title={`Net profit: ${fmtUSD(profit)}`}
            />
          )}
        </div>
        {/* Endpoint labels */}
        <div className="mt-2 flex items-baseline justify-between text-[11px]">
          <span className="text-muted-foreground">Costs</span>
          {profit > 0 && (
            <span className="font-medium text-[hsl(var(--success))] tabular-nums">
              + {fmtUSD(profit)} profit
            </span>
          )}
        </div>
      </div>

      {cc && (
        <p className="text-[11px] text-muted-foreground mb-3">
          {cc.stateName} ({cc.sourceState}) rates · tap a row for itemized closing costs.
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => {
          const pct = total > 0 ? (row.value / total) * 100 : 0;
          if (row.kind === "flat") {
            return (
              <li key={row.label} className="flex items-center gap-3 py-1.5">
                <span
                  className={`h-2.5 w-2.5 rounded-sm shrink-0 ${segmentColor(row.tone)}`}
                  aria-hidden
                />
                <span className="text-sm text-muted-foreground flex-1 min-w-0 truncate">
                  {row.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground/70 w-10 text-right">
                  {pct.toFixed(0)}%
                </span>
                <span className="text-sm tabular-nums font-medium w-20 text-right">
                  {fmtUSD(row.value)}
                </span>
              </li>
            );
          }
          return (
            <ExpandableRow
              key={row.label}
              label={row.label}
              value={row.value}
              pct={pct}
              tone={row.tone}
              items={row.items}
              emptyHint={row.emptyHint}
            />
          );
        })}
      </ul>
      <div className="mt-4 pt-4 border-t border-card-border flex items-baseline justify-between">
        <span className="text-sm font-semibold">Total project cost</span>
        <span className="font-display text-base font-semibold tabular-nums">
          {fmtUSD(total)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">After Repair Value</span>
        <span className="text-sm font-medium tabular-nums">
          {fmtUSD(inputs.arv)}
        </span>
      </div>
    </div>
  );
}

type SegmentTone =
  | "primary"
  | "rehab"
  | "buy-close"
  | "financing"
  | "holding"
  | "sell-close"
  | "commission";

function segmentColor(tone: SegmentTone): string {
  // Coastal Teal cost-segment ramp: deep teal → aqua → jade → cool slate.
  switch (tone) {
    case "primary":
      return "bg-[hsl(192_76%_30%)]"; // #126D85 — brand teal
    case "rehab":
      return "bg-[hsl(188_70%_42%)]";
    case "buy-close":
      return "bg-[hsl(178_65%_48%)]";
    case "financing":
      return "bg-[hsl(165_60%_50%)]";
    case "holding":
      return "bg-[hsl(155_55%_55%)]";
    case "sell-close":
      return "bg-[hsl(220_15%_58%)]";
    case "commission":
      return "bg-[hsl(220_12%_72%)]";
  }
}

function ExpandableRow({
  label,
  value,
  pct,
  tone,
  items,
  emptyHint,
}: {
  label: string;
  value: number;
  pct: number;
  tone: SegmentTone;
  items: { label: string; amount: number; note?: string }[];
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasItems = items.length > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => hasItems && setOpen((v) => !v)}
        disabled={!hasItems}
        className={`w-full flex items-center gap-3 py-1.5 text-left ${
          hasItems ? "hover:text-foreground transition-colors cursor-pointer" : "cursor-default"
        }`}
        aria-expanded={open}
        data-testid={`button-expand-${label.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-sm shrink-0 ${segmentColor(tone)}`}
          aria-hidden
        />
        <span className="text-sm text-muted-foreground flex-1 min-w-0 flex items-center gap-1 truncate">
          {label}
          {hasItems && (
            <ChevronRight
              className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            />
          )}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground/70 w-10 text-right">
          {pct.toFixed(0)}%
        </span>
        <span className="text-sm tabular-nums font-medium w-20 text-right">
          {fmtUSD(value)}
        </span>
      </button>
      {open && hasItems && (
        <motion.ul
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="mt-1 ml-5 pl-3 border-l border-card-border space-y-1.5 text-xs pb-2"
        >
          {items.map((it) => (
            <li key={it.label} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-foreground/80">{it.label}</div>
                {it.note && (
                  <div className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">
                    {it.note}
                  </div>
                )}
              </div>
              <span className="tabular-nums text-foreground/70 shrink-0">{fmtUSD(it.amount)}</span>
            </li>
          ))}
        </motion.ul>
      )}
      {open && !hasItems && emptyHint && (
        <p className="mt-2 ml-5 text-xs text-muted-foreground">{emptyHint}</p>
      )}
    </li>
  );
}

function WhatIf({
  inputs,
  onChange,
}: {
  inputs: DealInputs;
  onChange: (i: DealInputs) => void;
}) {
  const [local, setLocal] = useState(inputs);
  const r = calculateDeal(local);
  const profitable = r.netProfit > 0;
  const isCash = local.financingType === "cash";

  function update<K extends keyof DealInputs>(key: K, value: DealInputs[K]) {
    const next = { ...local, [key]: value };
    setLocal(next);
    onChange(next);
  }

  return (
    <div className="space-y-5">
      {/* Financing toggle — Cash zeros out points/interest/loan fees */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Financing
        </div>
        <div
          className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-card/50 border border-card-border"
          role="tablist"
          aria-label="Financing type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isCash}
            onClick={() => update("financingType", "hard_money")}
            data-testid="button-financing-hard-money"
            className={`py-2 rounded-md text-sm font-medium transition-colors tabular-nums ${
              !isCash
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Hard money
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isCash}
            onClick={() => update("financingType", "cash")}
            data-testid="button-financing-cash"
            className={`py-2 rounded-md text-sm font-medium transition-colors tabular-nums ${
              isCash
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All cash
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {isCash
            ? `No interest, points, or loan fees — saves ${fmtUSD(
                inputs.financingType === "cash"
                  ? 0
                  : calculateDeal(inputs).totalFinancingCost,
              )} vs hard money.`
            : `${local.loanLtcPct}% LTC · ${local.loanRatePct}% interest · ${local.loanPointsPct} pts`}
        </p>
      </div>

      <Slider
        label="Purchase price"
        value={local.purchasePrice}
        min={Math.max(0, Math.floor(inputs.purchasePrice * 0.6))}
        max={Math.ceil(Math.max(inputs.purchasePrice * 1.4, 1))}
        step={1000}
        onChange={(v) => update("purchasePrice", v)}
      />
      <Slider
        label="Rehab budget"
        value={local.rehabBudget}
        min={0}
        max={Math.ceil(Math.max(inputs.rehabBudget * 1.5, 1))}
        step={1000}
        onChange={(v) => update("rehabBudget", v)}
      />
      <Slider
        label="ARV"
        value={local.arv}
        min={Math.max(0, Math.floor(inputs.arv * 0.7))}
        max={Math.ceil(Math.max(inputs.arv * 1.3, 1))}
        step={1000}
        onChange={(v) => update("arv", v)}
      />
      <div className="pt-3 border-t border-card-border flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Updated profit</span>
        <span
          className={`text-xl font-semibold tabular-nums ${
            profitable
              ? "text-[hsl(var(--success))]"
              : "text-destructive"
          }`}
          data-testid="text-whatif-profit"
        >
          {fmtUSD(r.netProfit)}
        </span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <span className="text-sm font-medium tabular-nums">{fmtUSD(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[hsl(var(--accent))]"
      />
    </div>
  );
}
