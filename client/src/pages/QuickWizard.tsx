import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AddressAutocomplete,
  type AddressMatch,
} from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal } from "@shared/schema";

export const HOLDING_PERIOD_OPTIONS = [3, 6, 9, 12, 18, 24] as const;
export const DEFAULT_HOLDING_MONTHS = 6;
export const DEFAULT_IS_CASH_PURCHASE = false;
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  Sparkles,
  RefreshCw,
  Home,
} from "lucide-react";
import { fmtUSD } from "@/lib/calc";

type Step = 0 | 1 | 2 | 3;
const STEP_COUNT = 4;

// Shape returned by /api/comps
type CompsResponse = {
  subject: { address: string; sqft: number | null };
  target?: {
    sqft: number | null;
    beds: number | null;
    baths: number | null;
  };
  arv: number;
  arvLow: number;
  arvHigh: number;
  medianPricePerSqft: number | null;
  arvMethod?: string;
  arvAnchorPpsf?: number | null;
  arvTopCompIds?: string[];
  compCount: number;
  radiusMiles: number | null;
  quality?: {
    level: "good" | "wide" | "low";
    message: string | null;
    standardMaxRadius: number;
    minComps: number;
  };
  comps: Array<{
    id: string;
    address: string;
    price: number;
    sqft: number | null;
    beds: number | null;
    baths: number | null;
    yearBuilt: number | null;
    distance: number;
    daysOld: number;
    pricePerSqft: number | null;
    lat: number | null;
    lon: number | null;
    saleStatus: string | null;
  }>;
};

export default function QuickWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const [address, setAddress] = useState<AddressMatch | null>(null);
  const [purchase, setPurchase] = useState<string>("");
  const [rehab, setRehab] = useState<string>("");
  const [arv, setArv] = useState<string>("");

  // Post-rehab spec changes (sqft / beds / baths). Off by default.
  const [changingSpecs, setChangingSpecs] = useState(false);
  const [finalSqft, setFinalSqft] = useState<string>("");
  const [finalBeds, setFinalBeds] = useState<string>("");
  const [finalBaths, setFinalBaths] = useState<string>("");

  // Teardown flag (separate from spec changes — applies to lot value plays)
  const [isTeardown, setIsTeardown] = useState(false);

  // Holding period in months — drives ROI / annualized / financing math.
  // Resets to 6 on every fresh wizard load (no persistence).
  const [holdingMonths, setHoldingMonths] = useState<number>(
    DEFAULT_HOLDING_MONTHS,
  );

  // Cash vs Financed toggle — when true, calc zeros loan interest/points/fees.
  // Resets to Financed (false) on every fresh wizard load (no persistence).
  const [isCashPurchase, setIsCashPurchase] = useState<boolean>(
    DEFAULT_IS_CASH_PURCHASE,
  );

  // Subject property facts fetched from RentCast right after address selection.
  // Used to prefill the post-rehab spec inputs, fall back to baseline for blanks,
  // and surface lot size on the rehab/result pages.
  const [subjectFacts, setSubjectFacts] = useState<{
    sqft: number | null;
    beds: number | null;
    baths: number | null;
    lotSqft: number | null;
    lotAcres: number | null;
    yearBuilt: number | null;
    propertyType: string | null;
  } | null>(null);

  // Fetch subject property facts when address changes
  useEffect(() => {
    if (!address) {
      setSubjectFacts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/property/lookup?address=${encodeURIComponent(address.matchedAddress)}`,
        );
        const data = await res.json();
        if (cancelled) return;
        setSubjectFacts({
          sqft: typeof data?.sqft === "number" ? data.sqft : null,
          beds: typeof data?.beds === "number" ? data.beds : null,
          baths: typeof data?.baths === "number" ? data.baths : null,
          lotSqft: typeof data?.lotSqft === "number" ? data.lotSqft : null,
          lotAcres: typeof data?.lotAcres === "number" ? data.lotAcres : null,
          yearBuilt: typeof data?.yearBuilt === "number" ? data.yearBuilt : null,
          propertyType:
            typeof data?.propertyType === "string"
              ? data.propertyType
              : null,
        });
      } catch {
        // Silent: spec inputs just won't prefill.
        if (!cancelled) setSubjectFacts(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Comps state
  const [useOwnComps, setUseOwnComps] = useState(false);
  const [compsData, setCompsData] = useState<CompsResponse | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);
  const [compsError, setCompsError] = useState<string | null>(null);

  async function pullComps() {
    if (!address) return;
    setCompsLoading(true);
    setCompsError(null);
    try {
      const params = new URLSearchParams({ address: address.matchedAddress });
      if (changingSpecs) {
        // Resolve each spec: explicit value > subject property baseline > skip
        const resolveSpec = (typed: string, baseline: number | null) => {
          const n = parseNumber(typed);
          if (n > 0) return n;
          if (baseline != null && baseline > 0) return baseline;
          return null;
        };
        const fSqft = resolveSpec(finalSqft, subjectFacts?.sqft ?? null);
        const fBeds = resolveSpec(finalBeds, subjectFacts?.beds ?? null);
        const fBaths = resolveSpec(finalBaths, subjectFacts?.baths ?? null);
        if (fSqft != null) params.set("targetSqft", String(fSqft));
        if (fBeds != null) params.set("targetBeds", String(fBeds));
        if (fBaths != null) params.set("targetBaths", String(fBaths));
      }
      const url = `/api/comps?${params.toString()}`;
      const res = await apiRequest("GET", url);
      const data = (await res.json()) as CompsResponse;
      setCompsData(data);
      setArv(String(data.arv)); // pre-fill ARV with auto value
    } catch (e: any) {
      let msg = "Couldn't pull comps for this address.";
      try {
        // apiRequest wraps response errors with status codes
        const m = String(e?.message ?? "");
        if (m.includes(":")) msg = m.split(":").slice(1).join(":").trim() || msg;
      } catch {}
      setCompsError(msg);
    } finally {
      setCompsLoading(false);
    }
  }

  const createDeal = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("address required");
      const inputs = {
        ...defaultDealInputs,
        purchasePrice: parseNumber(purchase),
        rehabBudget: parseNumber(rehab),
        arv: parseNumber(arv),
        holdingMonths,
        isCashPurchase,
        isTeardown,
        ...(subjectFacts?.lotSqft != null && subjectFacts.lotSqft > 0
          ? { lotSqft: subjectFacts.lotSqft }
          : {}),
        ...(subjectFacts?.lotAcres != null && subjectFacts.lotAcres > 0
          ? { lotAcres: subjectFacts.lotAcres }
          : {}),
        ...(changingSpecs
          ? {
              // Persist the resolved values (typed override falls back to subject baseline)
              ...(() => {
                const resolveSpec = (
                  typed: string,
                  baseline: number | null,
                ) => {
                  const n = parseNumber(typed);
                  if (n > 0) return n;
                  if (baseline != null && baseline > 0) return baseline;
                  return null;
                };
                const fSqft = resolveSpec(
                  finalSqft,
                  subjectFacts?.sqft ?? null,
                );
                const fBeds = resolveSpec(
                  finalBeds,
                  subjectFacts?.beds ?? null,
                );
                const fBaths = resolveSpec(
                  finalBaths,
                  subjectFacts?.baths ?? null,
                );
                return {
                  ...(fSqft != null ? { finalSqft: fSqft } : {}),
                  ...(fBeds != null ? { finalBeds: fBeds } : {}),
                  ...(fBaths != null ? { finalBaths: fBaths } : {}),
                };
              })(),
            }
          : {}),
      };
      // Persist comp data on the deal via the `notes` JSON blob so the
      // result page can render the "Comps used" section. notes is a free-form
      // text column; we use a JSON envelope with a known shape.
      const notesPayload =
        compsData && !useOwnComps
          ? JSON.stringify({
              kind: "comps",
              version: 1,
              compsData,
            })
          : null;
      const body = {
        address: address.matchedAddress,
        city: address.components.city ?? null,
        state: address.components.state ?? null,
        zip: address.components.zip ?? null,
        lat: address.lat,
        lon: address.lon,
        beds: subjectFacts?.beds ?? null,
        baths: subjectFacts?.baths ?? null,
        sqft: subjectFacts?.sqft ?? compsData?.subject.sqft ?? null,
        yearBuilt: subjectFacts?.yearBuilt ?? null,
        inputs: JSON.stringify(inputs),
        notes: notesPayload,
      };
      const res = await apiRequest("POST", "/api/deals", body);
      return res.json() as Promise<Deal>;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      navigate(`/result/${deal.id}`);
    },
  });

  function next() {
    if (step < STEP_COUNT - 1) {
      setDirection(1);
      setStep((s) => (s + 1) as Step);
    } else {
      createDeal.mutate();
    }
  }

  function back() {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => (s - 1) as Step);
    } else {
      navigate("/");
    }
  }

  // On step 3, can advance only if we have an ARV value (auto or manual)
  const canAdvance =
    step === 0
      ? !!address
      : step === 1
        ? parseNumber(purchase) > 0
        : step === 2
          ? parseNumber(rehab) >= 0 && rehab.trim() !== ""
          : parseNumber(arv) > 0;

  // Enter advances on numeric steps
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canAdvance && step !== 0) {
      e.preventDefault();
      next();
    }
  }

  return (
    <div
      className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10"
      style={{
        paddingBottom: "calc(8rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Header: back + step indicator (mono eyebrow style) */}
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={back}
          data-testid="button-back"
          className="-ml-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          {step === 0 ? "Home" : "Back"}
        </Button>
        <span className="mono-eyebrow text-[11px] tracking-[0.18em]">
          Step {step + 1} of {STEP_COUNT}
        </span>
        <span className="w-12" />
      </div>

      {/* Glass card hosting the form */}
      <div
        className="glass-card relative overflow-hidden"
        style={{ padding: "26px 22px 22px" }}
      >
        <div onKeyDown={onKey} className="min-h-[380px] flex flex-col">
          <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction === 1 ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction === 1 ? -24 : 24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1"
          >
            {step === 0 && (
              <StepAddress
                address={address}
                onSelect={(m) => {
                  setAddress(m);
                  // Reset any prior comp state if user picks a new address
                  setCompsData(null);
                  setCompsError(null);
                  // Auto-advance after a short pause so user sees the selection
                  setTimeout(() => {
                    setDirection(1);
                    setStep(1);
                  }, 350);
                }}
                onClear={() => {
                  setAddress(null);
                  setCompsData(null);
                  setCompsError(null);
                }}
              />
            )}
            {step === 1 && (
              <StepNumber
                title="What's your purchase price?"
                subtitle="What you'll pay to acquire the property."
                value={purchase}
                onChange={setPurchase}
                placeholder="225,000"
                testId="input-purchase"
              />
            )}
            {step === 2 && (
              <StepRehab
                rehab={rehab}
                onRehabChange={setRehab}
                holdingMonths={holdingMonths}
                onHoldingMonthsChange={setHoldingMonths}
                isCashPurchase={isCashPurchase}
                onIsCashPurchaseChange={setIsCashPurchase}
                isTeardown={isTeardown}
                onTeardownChange={setIsTeardown}
                changingSpecs={changingSpecs}
                onToggleChanging={(v) => {
                  setChangingSpecs(v);
                  // Invalidate prior comp pull when spec mode changes
                  setCompsData(null);
                  setCompsError(null);
                  // Prefill from subject property baseline when toggling on
                  if (v && subjectFacts) {
                    if (subjectFacts.sqft && !finalSqft) {
                      setFinalSqft(String(subjectFacts.sqft));
                    }
                    if (subjectFacts.beds != null && !finalBeds) {
                      setFinalBeds(String(subjectFacts.beds));
                    }
                    if (subjectFacts.baths != null && !finalBaths) {
                      setFinalBaths(String(subjectFacts.baths));
                    }
                  }
                }}
                finalSqft={finalSqft}
                onFinalSqftChange={(v) => {
                  setFinalSqft(v);
                  setCompsData(null);
                }}
                finalBeds={finalBeds}
                onFinalBedsChange={(v) => {
                  setFinalBeds(v);
                  setCompsData(null);
                }}
                finalBaths={finalBaths}
                onFinalBathsChange={(v) => {
                  setFinalBaths(v);
                  setCompsData(null);
                }}
                subjectFacts={subjectFacts}
              />
            )}
            {step === 3 && (
              <StepArv
                useOwnComps={useOwnComps}
                onToggleOwn={(v) => {
                  setUseOwnComps(v);
                  if (v) {
                    // switching to manual — clear auto pre-fill so user enters fresh
                    setArv("");
                  } else if (compsData) {
                    setArv(String(compsData.arv));
                  }
                }}
                compsData={compsData}
                compsLoading={compsLoading}
                compsError={compsError}
                onPullComps={pullComps}
                arv={arv}
                onArvChange={setArv}
              />
            )}
          </motion.div>
        </AnimatePresence>

          {/* Segmented progress indicator (matches mock — bars at bottom of card) */}
          <div className="mt-8 flex gap-1.5">
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                  i <= step ? "bg-primary" : "bg-card-border"
                }`}
                aria-hidden
              />
            ))}
          </div>

          <p className="mt-4 text-[11px] text-muted-foreground/80">
            {step === 0
              ? "We use the U.S. Census Geocoder to standardize addresses."
              : step === 3
                ? "Press Enter or hit Calculate."
                : "Press Enter to continue."}
          </p>
        </div>
      </div>

      {/* Fixed Continue CTA at bottom (matches mock) */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 px-4 sm:px-6 pt-4 bg-gradient-to-t from-background via-background/95 to-transparent"
        style={{
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto max-w-2xl">
          <Button
            size="lg"
            onClick={next}
            disabled={!canAdvance || createDeal.isPending}
            data-testid="button-next"
            className="w-full h-12 rounded-2xl font-semibold tracking-tight
                       shadow-[0_10px_30px_-12px_rgba(18,109,133,0.55)]
                       dark:shadow-[0_8px_24px_rgba(95,212,231,0.30)]"
          >
            {createDeal.isPending ? (
              "Calculating…"
            ) : step === STEP_COUNT - 1 ? (
              <>
                Calculate <Check className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Continue <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepAddress({
  address,
  onSelect,
  onClear,
}: {
  address: AddressMatch | null;
  onSelect: (m: AddressMatch) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <h2 className="font-display font-bold tracking-[-0.02em] text-[28px] sm:text-3xl leading-[1.1] mb-2 text-foreground">
        What's the address?
      </h2>
      <p className="text-[15px] text-muted-foreground mb-7 leading-relaxed">
        Drop a property and we'll pull comps, taxes, and a Deal Score in seconds.
      </p>
      <div className="mono-eyebrow mb-2 text-[11px] tracking-[0.18em]">
        Property address
      </div>
      {address ? (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 flex items-start gap-3">
          <MapPin className="h-5 w-5 text-accent mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">
              {address.matchedAddress}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Looks good — moving on…
            </p>
          </div>
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-clear-address"
          >
            Change
          </button>
        </div>
      ) : (
        <AddressAutocomplete
          autoFocus
          placeholder="123 Main St, City, State"
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function StepArv({
  useOwnComps,
  onToggleOwn,
  compsData,
  compsLoading,
  compsError,
  onPullComps,
  arv,
  onArvChange,
}: {
  useOwnComps: boolean;
  onToggleOwn: (v: boolean) => void;
  compsData: CompsResponse | null;
  compsLoading: boolean;
  compsError: string | null;
  onPullComps: () => void;
  arv: string;
  onArvChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (useOwnComps) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [useOwnComps]);

  return (
    <div>
      <h2 className="font-display font-bold tracking-[-0.02em] text-[28px] sm:text-3xl leading-[1.1] mb-2 text-foreground">
        What's the ARV?
      </h2>
      <p className="text-[15px] text-muted-foreground mb-7 leading-relaxed">
        After Repair Value — what you expect to sell it for once renovated.
      </p>

      {/* Hero "Pull Comps" path — default */}
      {!useOwnComps && (
        <div className="space-y-5">
          {!compsData && !compsLoading && (
            <button
              onClick={onPullComps}
              disabled={compsLoading}
              data-testid="button-pull-comps"
              className="w-full rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent px-6 py-7 text-left hover:border-accent transition-all group active:scale-[0.99]"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0 group-hover:bg-accent/25 transition-colors">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold tracking-tight">
                    Pull Comps
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Auto-find recent sold comps and estimate ARV
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          )}

          {compsLoading && (
            <div className="rounded-2xl border border-card-border bg-card/50 px-6 py-7">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
                  <RefreshCw className="h-6 w-6 text-accent animate-spin" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold tracking-tight">
                    Pulling comps…
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Searching ¼ mile, then ½, then ¾ if needed
                  </p>
                </div>
              </div>
            </div>
          )}

          {compsError && !compsLoading && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/25 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-300 text-sm font-bold">!</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-200">
                      No comps found
                    </p>
                    <p className="text-sm text-red-100/90 mt-1">{compsError}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Enter your ARV manually below or retry.
                    </p>
                    <div className="flex items-center gap-3 mt-3">
                      <button
                        onClick={onPullComps}
                        className="text-sm font-medium text-red-200 hover:text-red-100 underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Inline manual ARV fallback when no comps found */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Manual ARV
                </p>
                <div className="relative">
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl sm:text-4xl font-semibold text-muted-foreground/60 select-none pointer-events-none">
                    $
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={arv}
                    onChange={(e) =>
                      onArvChange(e.target.value.replace(/[^\d.]/g, ""))
                    }
                    placeholder="395,000"
                    className="w-full bg-transparent border-0 border-b-2 border-card-border focus:border-accent outline-none pl-7 sm:pl-9 pb-2 text-3xl sm:text-4xl font-semibold tabular-nums tracking-tight transition-colors placeholder:text-muted-foreground/30"
                    data-testid="input-arv-fallback"
                    autoComplete="off"
                  />
                </div>
                {parseNumber(arv) > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {fmtUSD(parseNumber(arv))}
                  </p>
                )}
              </div>
            </div>
          )}

          {compsData && !compsLoading && (
            <div className="space-y-4">
              {/* Quality flag (wide search or low comp count) */}
              {compsData.quality && compsData.quality.level !== "good" && (
                <CompsFlag
                  level={compsData.quality.level}
                  message={
                    compsData.quality.message ??
                    "Comp quality is limited — review carefully."
                  }
                />
              )}
              {/* Auto-ARV summary */}
              <div className="rounded-2xl border border-accent/40 bg-accent/5 px-6 py-6">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <p className="text-xs font-semibold tracking-wide text-accent uppercase">
                    Auto-estimated ARV
                  </p>
                </div>
                <p className="text-4xl font-semibold tabular-nums tracking-tight">
                  {fmtUSD(compsData.arv)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Range {fmtUSD(compsData.arvLow)} – {fmtUSD(compsData.arvHigh)}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <Stat label="Comps" value={String(compsData.compCount)} />
                  <Stat
                    label="Radius"
                    value={
                      compsData.radiusMiles
                        ? `${compsData.radiusMiles} mi`
                        : "—"
                    }
                  />
                  <Stat
                    label="$/sqft"
                    value={
                      compsData.medianPricePerSqft
                        ? `$${compsData.medianPricePerSqft}`
                        : "—"
                    }
                  />
                </div>
                <button
                  onClick={onPullComps}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-accent"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh comps
                </button>
              </div>

              {/* Compact comp list — first 3 */}
              <div className="rounded-2xl border border-card-border overflow-hidden">
                <div className="px-4 py-2.5 bg-card/40 border-b border-card-border">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Comps used
                  </p>
                </div>
                <ul className="divide-y divide-card-border">
                  {compsData.comps.slice(0, 4).map((c) => (
                    <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                      <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {c.address}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.sqft ? `${c.sqft.toLocaleString()} sqft` : "—"}
                          {c.beds != null && c.baths != null
                            ? ` · ${c.beds}bd/${c.baths}ba`
                            : ""}
                          {" · "}
                          {c.distance.toFixed(2)} mi
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">
                          {fmtUSD(c.price)}
                        </p>
                        {c.pricePerSqft && (
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            ${c.pricePerSqft}/sqft
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual ARV path */}
      {useOwnComps && (
        <div className="relative">
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl sm:text-5xl font-semibold text-muted-foreground/60 select-none pointer-events-none">
            $
          </span>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={arv}
            onChange={(e) => onArvChange(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="395,000"
            className="w-full bg-transparent border-0 border-b-2 border-card-border focus:border-accent outline-none pl-7 sm:pl-10 pb-3 text-3xl sm:text-5xl font-semibold tabular-nums tracking-tight transition-colors placeholder:text-muted-foreground/30"
            data-testid="input-arv"
            autoComplete="off"
          />
          {parseNumber(arv) > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              {fmtUSD(parseNumber(arv))}
            </p>
          )}
        </div>
      )}

      {/* Toggle: use my own comps */}
      <label className="mt-6 flex items-center gap-2.5 cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={useOwnComps}
          onChange={(e) => onToggleOwn(e.target.checked)}
          className="h-4 w-4 rounded border-card-border text-accent focus:ring-accent focus:ring-offset-0"
          data-testid="checkbox-use-own-comps"
        />
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          Use my own comps
        </span>
      </label>
    </div>
  );
}

function CompsFlag({
  level,
  message,
}: {
  level: "wide" | "low";
  message: string;
}) {
  // Yellow for both wide and low — user requested yellow flag
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
      <div className="h-5 w-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-amber-300 text-xs font-bold">!</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
          {level === "low" ? "Limited comp data" : "Wide comp search"}
        </p>
        <p className="text-sm text-amber-100/90 mt-0.5">{message}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/50 border border-card-border/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function StepNumber({
  title,
  subtitle,
  value,
  onChange,
  placeholder,
  testId,
}: {
  title: string;
  subtitle: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus when this step mounts
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Only allow digits and one decimal
    const cleaned = e.target.value.replace(/[^\d.]/g, "");
    onChange(cleaned);
  }

  const numericValue = parseNumber(value);

  return (
    <div>
      <h2 className="font-display font-bold tracking-[-0.02em] text-[28px] sm:text-3xl leading-[1.1] mb-2 text-foreground">
        {title}
      </h2>
      <p className="text-[15px] text-muted-foreground mb-8 leading-relaxed">{subtitle}</p>
      <div className="relative">
        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl sm:text-5xl font-semibold text-muted-foreground/60 select-none pointer-events-none">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full bg-transparent border-0 border-b-2 border-card-border focus:border-accent outline-none pl-7 sm:pl-10 pb-3 text-3xl sm:text-5xl font-semibold tabular-nums tracking-tight transition-colors placeholder:text-muted-foreground/30"
          data-testid={testId}
          autoComplete="off"
        />
      </div>
      {numericValue > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {fmtUSD(numericValue)}
        </p>
      )}
    </div>
  );
}

function parseNumber(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Rehab step: budget + optional post-rehab spec changes (sqft / beds / baths)
function StepRehab({
  rehab,
  onRehabChange,
  holdingMonths,
  onHoldingMonthsChange,
  isCashPurchase,
  onIsCashPurchaseChange,
  isTeardown,
  onTeardownChange,
  changingSpecs,
  onToggleChanging,
  finalSqft,
  onFinalSqftChange,
  finalBeds,
  onFinalBedsChange,
  finalBaths,
  onFinalBathsChange,
  subjectFacts,
}: {
  rehab: string;
  onRehabChange: (v: string) => void;
  holdingMonths: number;
  onHoldingMonthsChange: (v: number) => void;
  isCashPurchase: boolean;
  onIsCashPurchaseChange: (v: boolean) => void;
  isTeardown: boolean;
  onTeardownChange: (v: boolean) => void;
  changingSpecs: boolean;
  onToggleChanging: (v: boolean) => void;
  finalSqft: string;
  onFinalSqftChange: (v: string) => void;
  finalBeds: string;
  onFinalBedsChange: (v: string) => void;
  finalBaths: string;
  onFinalBathsChange: (v: string) => void;
  subjectFacts: {
    sqft: number | null;
    beds: number | null;
    baths: number | null;
    lotSqft: number | null;
    lotAcres: number | null;
  } | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const numericValue = parseNumber(rehab);

  return (
    <div>
      <h2 className="font-display font-bold tracking-[-0.02em] text-[28px] sm:text-3xl leading-[1.1] mb-2 text-foreground">
        How much will you spend on rehab?
      </h2>
      <p className="text-[15px] text-muted-foreground mb-8 leading-relaxed">
        Materials + labor for renovations. We'll add a 10% safety buffer.
      </p>
      <div className="relative">
        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl sm:text-5xl font-semibold text-muted-foreground/60 select-none pointer-events-none">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={rehab}
          onChange={(e) => onRehabChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="55,000"
          className="w-full bg-transparent border-0 border-b-2 border-card-border focus:border-accent outline-none pl-7 sm:pl-10 pb-3 text-3xl sm:text-5xl font-semibold tabular-nums tracking-tight transition-colors placeholder:text-muted-foreground/30"
          data-testid="input-rehab"
          autoComplete="off"
        />
      </div>
      {numericValue > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {fmtUSD(numericValue)}
        </p>
      )}

      {/* Holding period — drives ROI / annualized / financing math */}
      <div className="mt-7">
        <div className="mono-eyebrow mb-2 text-[11px] tracking-[0.18em]">
          Holding Period (months)
        </div>
        <Select
          value={String(holdingMonths)}
          onValueChange={(v) => onHoldingMonthsChange(Number(v))}
        >
          <SelectTrigger
            className="h-11 rounded-xl border-card-border bg-background/50 focus:ring-accent focus:ring-offset-0 focus:border-accent text-base font-medium tabular-nums"
            data-testid="select-holding-months"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOLDING_PERIOD_OPTIONS.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m} months
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-[11px] text-muted-foreground/80">
          How long you'll own it before selling. Drives interest, taxes, and
          carrying costs.
        </p>
      </div>

      {/* Financed vs Cash — drives whether loan interest/points/fees are zeroed */}
      <div className="mt-7">
        <div className="mono-eyebrow mb-2 text-[11px] tracking-[0.18em]">
          Purchase Method
        </div>
        <div
          className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-card/50 border border-card-border"
          role="tablist"
          aria-label="Purchase method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isCashPurchase}
            onClick={() => onIsCashPurchaseChange(false)}
            data-testid="button-purchase-financed"
            className={`py-2.5 rounded-lg text-sm font-medium transition-colors tabular-nums ${
              !isCashPurchase
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Financed
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isCashPurchase}
            onClick={() => onIsCashPurchaseChange(true)}
            data-testid="button-purchase-cash"
            className={`py-2.5 rounded-lg text-sm font-medium transition-colors tabular-nums ${
              isCashPurchase
                ? "bg-accent text-accent-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Cash
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground/80">
          {isCashPurchase
            ? "All-cash buy — no interest, points, or loan fees. Taxes, insurance, and carrying costs still apply."
            : "Financed via hard money — includes interest, points, and loan fees over the hold."}
        </p>
      </div>

      {/* Lot size readout */}
      {subjectFacts?.lotAcres != null && subjectFacts.lotAcres > 0 && (
        <div className="mt-6 rounded-xl border border-card-border bg-card/30 px-4 py-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Lot size
          </span>
          <span className="text-sm tabular-nums" data-testid="text-lot-size">
            {subjectFacts.lotAcres.toFixed(3)} ac
            {subjectFacts.lotSqft != null && subjectFacts.lotSqft > 0 && (
              <span className="text-muted-foreground">
                {" "}/ {subjectFacts.lotSqft.toLocaleString()} sqft
              </span>
            )}
          </span>
        </div>
      )}

      {/* Teardown toggle */}
      <label className="mt-5 flex items-start gap-2.5 cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={isTeardown}
          onChange={(e) => onTeardownChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-card-border text-accent focus:ring-accent focus:ring-offset-0"
          data-testid="checkbox-teardown"
        />
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          This is a teardown (lot value play)
        </span>
      </label>

      {/* Spec change toggle */}
      <label className="mt-8 flex items-start gap-2.5 cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={changingSpecs}
          onChange={(e) => onToggleChanging(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-card-border text-accent focus:ring-accent focus:ring-offset-0"
          data-testid="checkbox-changing-specs"
        />
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          I'm adding square footage, bedrooms, or bathrooms
        </span>
      </label>

      {changingSpecs && (
        <div className="mt-5 rounded-2xl border border-card-border bg-card/40 p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
              Final specs after rehab
            </p>
            <p className="text-xs text-muted-foreground -mt-1.5 mb-4">
              Used to match comps to the finished house, not the as-is footprint.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SpecInput
              label="Sqft"
              value={finalSqft}
              onChange={onFinalSqftChange}
              placeholder={
                subjectFacts?.sqft ? subjectFacts.sqft.toLocaleString() : "1,400"
              }
              testId="input-final-sqft"
              hint={
                subjectFacts?.sqft
                  ? `Current: ${subjectFacts.sqft.toLocaleString()}`
                  : null
              }
            />
            <SpecInput
              label="Beds"
              value={finalBeds}
              onChange={onFinalBedsChange}
              placeholder={subjectFacts?.beds != null ? String(subjectFacts.beds) : "3"}
              testId="input-final-beds"
              hint={
                subjectFacts?.beds != null
                  ? `Current: ${subjectFacts.beds}`
                  : null
              }
            />
            <SpecInput
              label="Baths"
              value={finalBaths}
              onChange={onFinalBathsChange}
              placeholder={
                subjectFacts?.baths != null ? String(subjectFacts.baths) : "2"
              }
              testId="input-final-baths"
              hint={
                subjectFacts?.baths != null
                  ? `Current: ${subjectFacts.baths}`
                  : null
              }
            />
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            Blank fields fall back to the property's current specs. Beds/baths match within ±1.
          </p>
        </div>
      )}
    </div>
  );
}

function SpecInput({
  label,
  value,
  onChange,
  placeholder,
  testId,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testId: string;
  hint?: string | null;
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-card-border bg-background/50 px-3 py-2 text-base font-medium tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/40 transition-colors placeholder:text-muted-foreground/40"
        data-testid={testId}
        autoComplete="off"
      />
      {hint && (
        <p className="mt-1 text-[10px] text-muted-foreground/70 tabular-nums">
          {hint}
        </p>
      )}
    </div>
  );
}
