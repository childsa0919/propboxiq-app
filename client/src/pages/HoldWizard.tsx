import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, MapPin, Minus, Plus, ClipboardList } from "lucide-react";
import {
  AddressAutocomplete,
  type AddressMatch,
} from "@/components/AddressAutocomplete";
import { DealTypeGateway, type DealType } from "@/components/DealTypeGateway";
import { apiRequest } from "@/lib/queryClient";
import { useRentComps } from "@/lib/useRentComps";
import { fmtUSD } from "@/lib/calc";
import {
  DEFAULT_HOLD_STATE,
  decodeHoldState,
  encodeHoldState,
  estimatePropertyTax,
  type HoldWizardState,
  type RehabMode,
} from "@/lib/holdState";
import { cn } from "@/lib/utils";
import { WalkthroughBudget } from "@/components/WalkthroughBudget";
import { budgetGrandTotal, type DealBudget } from "@shared/budgetTemplate";
import type { Deal } from "@shared/schema";

const STEP_COUNT = 7;

/** Light feedback-detected haptic for chip taps / step advances. */
function haptic() {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor;
  if (cap?.isNativePlatform?.()) {
    const h = (
      window as {
        Capacitor?: {
          Plugins?: { Haptics?: { impact?: (o: { style: string }) => void } };
        };
      }
    ).Capacitor?.Plugins?.Haptics;
    h?.impact?.({ style: "light" });
  }
}

function round1k(n: number): number {
  return Math.round(n / 1000) * 1000;
}

/**
 * Decode any state the Result page's "Edit inputs" CTA passed back. When an
 * address is present we treat it as an edit round-trip: start on the address
 * step (step 1) with the prior inputs restored. Otherwise start fresh at the
 * gateway (step 0).
 */
function hydrateFromSearch(search: string): {
  initialStep: number;
  initialState: HoldWizardState;
  fromEdit: boolean;
} {
  const decoded = decodeHoldState(search);
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const fromEdit = decoded.address.trim().length > 0;
  if (!fromEdit) {
    // Cross-route entry from the Flip gateway (user switched to Hold and tapped
    // Continue) carries `?gateway=skip`. Skip our own gateway and open on the
    // address step so the strategy choice isn't re-confirmed.
    const skipGateway = params.get("gateway") === "skip";
    return {
      initialStep: skipGateway ? 1 : 0,
      initialState: { ...DEFAULT_HOLD_STATE },
      fromEdit: false,
    };
  }
  const stepParam = Number(params.get("step"));
  const initialStep =
    Number.isFinite(stepParam) && stepParam >= 1 && stepParam <= STEP_COUNT - 1
      ? stepParam
      : 1;
  return { initialStep, initialState: decoded, fromEdit: true };
}

export default function HoldWizard() {
  const [, navigate] = useLocation();
  const search = useSearch();
  // When the Result page's "Edit inputs" CTA links back, the URL carries the
  // full encoded state. Hydrate from it once on mount so back-nav restores
  // every input and the RentCast refetch doesn't clobber user values.
  const hydrated = useRef(hydrateFromSearch(search));
  // Step 0 = gateway (STEP 1/7). Steps 1-6 are wizard steps (STEP 2/7 … 7/7).
  const [step, setStep] = useState(hydrated.current.initialStep);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [state, setState] = useState<HoldWizardState>(hydrated.current.initialState);
  const [pricingTouched, setPricingTouched] = useState(hydrated.current.fromEdit);
  const [rentTouched, setRentTouched] = useState(hydrated.current.fromEdit);

  // Walkthrough Budget — in-memory for the wizard session. "Apply to Deal"
  // enables rehab and fills the rehab number with the grand total.
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [walkBudget, setWalkBudget] = useState<DealBudget | null>(null);

  const update = useCallback((patch: Partial<HoldWizardState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // Fetch RentCast property + rent data once an address is chosen. When we
  // hydrated from an Edit round-trip, skip the initial fetch for that address
  // so we don't overwrite the user's prior values.
  const fetchedFor = useRef<string | null>(
    hydrated.current.fromEdit ? hydrated.current.initialState.address : null,
  );
  useEffect(() => {
    if (!state.address || fetchedFor.current === state.address) return;
    fetchedFor.current = state.address;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/property/full?address=${encodeURIComponent(state.address)}${
            state.zip ? `&zip=${encodeURIComponent(state.zip)}` : ""
          }`,
        );
        const data = await res.json();
        if (cancelled) return;
        const rentMedian =
          typeof data?.rentEstimate?.rent === "number"
            ? data.rentEstimate.rent
            : null;
        const rentLow =
          typeof data?.rentEstimate?.rentLow === "number"
            ? data.rentEstimate.rentLow
            : null;
        const rentHigh =
          typeof data?.rentEstimate?.rentHigh === "number"
            ? data.rentEstimate.rentHigh
            : null;
        const annualTax =
          typeof data?.taxes?.latestTaxAmount === "number"
            ? data.taxes.latestTaxAmount
            : null;
        const marketCap =
          typeof data?.market?.singleFamily?.medianPrice === "number" &&
          data.market.singleFamily.medianPrice > 0 &&
          rentMedian
            ? // crude market cap rate: annualized median rent yield is unknown,
              // so leave null unless explicitly provided. (Result page falls
              // back to absolute cap scoring when this is null.)
              null
            : null;
        const listPrice =
          typeof data?.market?.singleFamily?.medianPrice === "number"
            ? data.market.singleFamily.medianPrice
            : null;

        update({
          beds: typeof data?.facts?.beds === "number" ? data.facts.beds : null,
          baths:
            typeof data?.facts?.baths === "number" ? data.facts.baths : null,
          rentLow,
          rentMedian,
          rentHigh,
          rentCompCount: Array.isArray(data?.rentalHistory)
            ? data.rentalHistory.length
            : null,
          annualPropertyTax: annualTax,
          marketCapRatePct: marketCap,
          listPrice,
          zestimate: listPrice ? round1k(listPrice * 1.03) : null,
          valueEstimate: listPrice,
        });

        // Pre-fill smart defaults the user hasn't touched yet.
        setState((s) => {
          const basePrice = listPrice ?? 0;
          const next: Partial<HoldWizardState> = {};
          if (!pricingTouched && basePrice > 0 && s.purchasePrice === 0) {
            next.purchasePrice = round1k(basePrice);
          }
          if (!rentTouched && rentMedian && s.monthlyRent === 0) {
            next.monthlyRent = Math.round(rentMedian);
          }
          return { ...s, ...next };
        });
      } catch {
        // RentCast unavailable — user can still type values manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.address, state.zip, update, pricingTouched, rentTouched]);

  function advance() {
    haptic();
    if (step < STEP_COUNT - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    } else {
      navigate(`/hold/result?${encodeHoldState(state)}`);
    }
  }

  function back() {
    haptic();
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    } else {
      navigate("/");
    }
  }

  function handleGateway(type: DealType) {
    if (type === "flip") {
      navigate("/quick?gateway=skip");
      return;
    }
    setDirection(1);
    setStep(1);
  }

  // Per-step gating + contextual footer hint.
  const gate = stepGate(step, state);

  const progressPct = ((step + 1) / STEP_COUNT) * 100;

  return (
    <div
      className="wizard-canvas mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10"
      style={{ paddingBottom: "calc(8rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Wizard chrome: × Cancel + STEP n/7 + progress bar. Step 0 (the
          gateway) renders its own canonical chrome inside DealTypeGateway, so
          this per-route chrome covers only the real wizard steps (STEP 2/7…). */}
      {step > 0 && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              data-testid="button-cancel"
              className="flex min-h-[44px] items-center gap-1.5 text-[12px] font-bold text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <span
              className="mono-eyebrow text-[10px] tracking-[0.16em]"
              data-testid="text-step-counter"
            >
              STEP {step + 1}/{STEP_COUNT}
            </span>
            <span className="w-16" />
          </div>
          <div className="mb-5 h-[3px] w-full overflow-hidden rounded-full bg-[#232c37]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, #126D85, #5fd4e7)",
              }}
              aria-hidden
            />
          </div>
        </>
      )}

      <div
        className="wizard-screen relative overflow-hidden"
        style={{ padding: "24px 20px 22px" }}
      >
        <div className="flex min-h-[420px] flex-col">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction === 1 ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 1 ? -24 : 24 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-1 flex-col"
            >
              {step === 0 && (
                <DealTypeGateway
                  defaultType="hold"
                  onContinue={handleGateway}
                  onCancel={() => navigate("/")}
                />
              )}
              {step === 1 && (
                <StepAddress
                  state={state}
                  onSelect={(m) => {
                    update({
                      address: m.matchedAddress,
                      zip: m.components.zip ?? null,
                    });
                    haptic();
                    setTimeout(() => {
                      setDirection(1);
                      setStep(2);
                    }, 350);
                  }}
                  onClear={() => {
                    fetchedFor.current = null;
                    update({ ...DEFAULT_HOLD_STATE, address: "" });
                  }}
                />
              )}
              {step === 2 && (
                <StepPurchase
                  state={state}
                  onSelect={(price) => {
                    setPricingTouched(true);
                    update({ purchasePrice: price });
                    haptic();
                  }}
                />
              )}
              {step === 3 && (
                <StepRehab
                  state={state}
                  update={update}
                  onOpenBudget={() => setBudgetOpen(true)}
                />
              )}
              {step === 4 && (
                <StepRent
                  state={state}
                  onSelect={(rent) => {
                    setRentTouched(true);
                    update({ monthlyRent: rent });
                    haptic();
                  }}
                />
              )}
              {step === 5 && <StepLoan state={state} update={update} />}
              {step === 6 && <StepReserves state={state} update={update} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Fixed Continue CTA */}
      {step > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 px-4 pt-4 sm:px-6"
          style={{
            paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
            background:
              "linear-gradient(to top, var(--brand-ink) 55%, transparent)",
          }}
        >
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={advance}
              disabled={!gate.canAdvance}
              data-testid="button-continue"
              style={{ backgroundColor: "var(--brand-teal)" }}
              className={cn(
                "flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] text-[14px] font-extrabold text-white transition-all duration-200",
                "shadow-[0_12px_30px_-10px_rgba(18,109,133,0.7)]",
                gate.canAdvance
                  ? "cursor-pointer hover:brightness-110 active:scale-[0.99]"
                  : "cursor-not-allowed opacity-40 shadow-none",
              )}
            >
              {step === STEP_COUNT - 1 ? "Analyze hold deal" : "Continue"}
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </button>
            <p className="mt-2.5 text-center text-xs font-bold text-white/40">
              {gate.hint}
            </p>
          </div>
        </div>
      )}

      {/* Walkthrough Budget — in-memory on the wizard; "Apply to Deal" enables
          rehab (BRRRR mode) and fills the rehab number with the grand total. */}
      <WalkthroughBudget
        deal={
          {
            id: NaN,
            name: null,
            address: state.address || "New deal",
          } as unknown as Deal
        }
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
        budgetOverride={walkBudget}
        onBudgetChange={setWalkBudget}
        onApply={(total) =>
          update({
            rehabEnabled: true,
            rehabMode: "brrrr",
            rehab: Math.round(total),
          })
        }
      />
    </div>
  );
}

// --- Per-step gating ------------------------------------------------------

function stepGate(
  step: number,
  s: HoldWizardState,
): { canAdvance: boolean; hint: string } {
  switch (step) {
    case 1:
      return {
        canAdvance: !!s.address,
        hint: "Add an address to continue",
      };
    case 2:
      return {
        canAdvance: s.purchasePrice > 0,
        hint: "Set a purchase price to continue",
      };
    case 3:
      return { canAdvance: true, hint: "Add a rehab budget or skip" };
    case 4:
      return {
        canAdvance: s.monthlyRent > 0,
        hint: "Set monthly rent to continue",
      };
    case 5:
      return { canAdvance: true, hint: "Tap any row to fine-tune your loan" };
    case 6:
      return { canAdvance: true, hint: "All inputs editable on the result page" };
    default:
      return { canAdvance: true, hint: "" };
  }
}

// --- Shared step header ---------------------------------------------------

function StepHead({
  eyebrow,
  title,
  help,
}: {
  eyebrow: string;
  title: string;
  help: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 text-[9px] font-bold tracking-[0.16em] text-accent">
        {eyebrow}
      </div>
      <h2 className="mb-1 font-display text-[22px] font-bold leading-[1.15] tracking-[-0.015em] text-foreground">
        {title}
      </h2>
      <p className="text-[12px] leading-[1.5] text-muted-foreground">{help}</p>
    </div>
  );
}

// --- Step 1: Address ------------------------------------------------------

function StepAddress({
  state,
  onSelect,
  onClear,
}: {
  state: HoldWizardState;
  onSelect: (m: AddressMatch) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <StepHead
        eyebrow="PROPERTY"
        title="What's the address?"
        help="We'll pull tax, rent comps, and sale comps from RentCast."
      />
      {state.address ? (
        <div className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-4">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{state.address}</p>
            <p className="mt-1 text-xs text-muted-foreground">
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
          placeholder="1247 Westfield Dr, Bowie, MD"
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

// --- Step 2: Purchase price ----------------------------------------------

const PURCHASE_CHIPS = [
  { label: "−5%", mult: 0.95 },
  { label: "Asking", mult: 1.0 },
  { label: "+5%", mult: 1.05 },
  { label: "+10%", mult: 1.1 },
] as const;

function StepPurchase({
  state,
  onSelect,
}: {
  state: HoldWizardState;
  onSelect: (price: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const base = state.listPrice ?? state.zestimate ?? 0;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [editing]);

  function selectedMult(): number | null {
    if (base <= 0) return null;
    for (const c of PURCHASE_CHIPS) {
      if (Math.abs(state.purchasePrice - round1k(base * c.mult)) < 1) {
        return c.mult;
      }
    }
    return null;
  }
  const activeMult = selectedMult();

  return (
    <div className="flex flex-1 flex-col">
      <StepHead
        eyebrow="PRICE"
        title="Purchase price?"
        help="What you'd actually offer or pay at closing."
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {PURCHASE_CHIPS.map((c) => {
          const val = base > 0 ? round1k(base * c.mult) : 0;
          const on = activeMult === c.mult && !editing;
          return (
            <button
              key={c.label}
              type="button"
              disabled={base <= 0}
              onClick={() => {
                setEditing(false);
                onSelect(val);
              }}
              data-testid={`chip-purchase-${c.label}`}
              className={cn(
                "min-h-[44px] rounded-full border px-4 text-[12px] font-bold transition-colors disabled:opacity-40",
                on
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 bg-[#1c242d] text-muted-foreground",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Tap-to-edit displayed price */}
      {editing ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/50 bg-[#1c242d] px-3.5 py-3">
          <span className="text-muted-foreground">$</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            defaultValue={state.purchasePrice ? String(state.purchasePrice) : ""}
            onChange={(e) =>
              onSelect(Number(e.target.value.replace(/[^\d]/g, "")) || 0)
            }
            onBlur={() => setEditing(false)}
            placeholder="420000"
            className="w-full bg-transparent text-[18px] font-extrabold tabular-nums text-foreground outline-none"
            data-testid="input-purchase"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="button-edit-purchase"
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#1c242d] px-3.5 py-3 text-left"
        >
          <span className="text-[20px] font-extrabold tabular-nums text-foreground">
            {state.purchasePrice > 0 ? fmtUSD(state.purchasePrice) : "—"}
          </span>
          <span className="text-[9px] font-bold tracking-wide text-accent">
            TAP TO EDIT
          </span>
        </button>
      )}

      {/* Reference rows */}
      <div className="space-y-2 rounded-xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] to-transparent p-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">RentCast est</span>
          <span className="font-bold text-accent">
            {state.listPrice ? fmtUSD(state.listPrice) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Zestimate</span>
          <span className="font-bold text-accent">
            {state.zestimate ? fmtUSD(state.zestimate) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Step 3: Rehab (optional) --------------------------------------------

function StepRehab({
  state,
  update,
  onOpenBudget,
}: {
  state: HoldWizardState;
  update: (p: Partial<HoldWizardState>) => void;
  onOpenBudget: () => void;
}) {
  function setMode(mode: RehabMode) {
    haptic();
    if (mode === "turnkey") {
      update({ rehabMode: mode, rehab: state.rehab > 0 ? state.rehab : 2500 });
    } else {
      update({ rehabMode: mode });
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <StepHead
        eyebrow="REHAB · OPTIONAL"
        title="Add rehab budget?"
        help="BRRRR-style heavy rehab, or light turnkey cosmetics. Skip for pure turnkey."
      />

      {/* Toggle */}
      <button
        type="button"
        onClick={() => {
          haptic();
          const on = !state.rehabEnabled;
          update({
            rehabEnabled: on,
            rehab: on ? (state.rehabMode === "turnkey" ? 2500 : state.rehab) : 0,
          });
        }}
        data-testid="toggle-rehab"
        className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-[#1c242d] px-3.5 py-3"
      >
        <div className="text-left">
          <div className="text-[12px] font-bold text-foreground">
            Add rehab budget?
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Buy · Rehab · (Refi) · Hold
          </div>
        </div>
        <span
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            state.rehabEnabled ? "bg-[#126D85]" : "bg-[#232c37]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
              state.rehabEnabled ? "left-[18px]" : "left-0.5",
            )}
          />
        </span>
      </button>

      {state.rehabEnabled && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <RehabOption
              label="BRRRR"
              sub="Heavy rehab · refi at ARV"
              active={state.rehabMode === "brrrr"}
              onClick={() => setMode("brrrr")}
            />
            <RehabOption
              label="Turnkey"
              sub="Light · $0–$5k cosmetic"
              active={state.rehabMode === "turnkey"}
              onClick={() => setMode("turnkey")}
            />
          </div>

          {state.rehabMode === "brrrr" ? (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#1c242d] px-3.5 py-3">
              <span className="text-muted-foreground">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={state.rehab ? String(state.rehab) : ""}
                onChange={(e) =>
                  update({ rehab: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })
                }
                placeholder="35000"
                className="w-full bg-transparent text-[18px] font-extrabold tabular-nums text-foreground outline-none"
                data-testid="input-rehab"
              />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#1c242d] px-3.5 py-3">
              <span className="text-[11px] text-muted-foreground">
                Turnkey cosmetic budget
              </span>
              <span className="text-[16px] font-extrabold tabular-nums text-foreground">
                {fmtUSD(state.rehab || 2500)}
              </span>
            </div>
          )}

          {/* Walkthrough Budget — itemize rehab; "Apply to Deal" fills the
              number above with the grand total. */}
          <button
            type="button"
            onClick={onOpenBudget}
            className="mt-3 flex w-full items-center justify-center gap-2 py-3.5 font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#f5c948", color: "#0a0e12", borderRadius: 12 }}
            data-testid="button-walkthrough-budget"
          >
            <ClipboardList className="h-4 w-4" />
            Walkthrough Budget
          </button>
        </>
      )}
    </div>
  );
}

function RehabOption({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`option-rehab-${label.toLowerCase()}`}
      className={cn(
        "min-h-[44px] rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-accent/55 bg-accent/10"
          : "border-white/10 bg-[#1c242d]",
      )}
    >
      <div
        className={cn(
          "text-[13px] font-extrabold",
          active ? "text-accent" : "text-foreground",
        )}
      >
        {label}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
    </button>
  );
}

// --- Step 4: Rent ---------------------------------------------------------

function StepRent({
  state,
  onSelect,
}: {
  state: HoldWizardState;
  onSelect: (rent: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [editing]);

  // Rent comps fire on mount of this step (StepRent only renders at step 4),
  // so the fetch starts exactly when the user lands on the monthly-rent page —
  // never earlier. Address comes from the earlier address step.
  const { data: rentComps, isLoading: compsLoading, error: compsError, refetch } =
    useRentComps(state.address || null);
  // Prefer the comps endpoint's median; fall back to the property/full estimate
  // already in state so the "Use median" button works even before comps land.
  const medianRent = rentComps?.median ?? state.rentMedian ?? null;

  const chips: { label: string; value: number | null }[] = [
    { label: "Low", value: state.rentLow },
    { label: "Median", value: state.rentMedian },
    { label: "High", value: state.rentHigh },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <StepHead
        eyebrow="RENT"
        title="Monthly rent?"
        help="Pulled from RentCast rent comps for the subject."
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        {chips.map((c) => {
          const on =
            c.value != null && Math.round(c.value) === state.monthlyRent && !editing;
          return (
            <button
              key={c.label}
              type="button"
              disabled={c.value == null}
              onClick={() => {
                setEditing(false);
                if (c.value != null) onSelect(Math.round(c.value));
              }}
              data-testid={`chip-rent-${c.label.toLowerCase()}`}
              className={cn(
                "min-h-[44px] rounded-xl border px-2 py-2 transition-colors disabled:opacity-40",
                on
                  ? "border-accent/55 bg-accent/10"
                  : "border-white/10 bg-[#1c242d]",
              )}
            >
              <div
                className={cn(
                  "text-[11px] font-bold",
                  on ? "text-accent" : "text-muted-foreground",
                )}
              >
                {c.label}
              </div>
              <div className="mt-0.5 text-[13px] font-extrabold tabular-nums text-foreground">
                {c.value != null ? fmtUSD(Math.round(c.value)) : "—"}
              </div>
            </button>
          );
        })}
      </div>

      {editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-accent/50 bg-[#1c242d] px-3.5 py-3">
          <span className="text-muted-foreground">$</span>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            defaultValue={state.monthlyRent ? String(state.monthlyRent) : ""}
            onChange={(e) =>
              onSelect(Number(e.target.value.replace(/[^\d]/g, "")) || 0)
            }
            onBlur={() => setEditing(false)}
            placeholder="2950"
            className="w-full bg-transparent text-[18px] font-extrabold tabular-nums text-foreground outline-none"
            data-testid="input-rent"
          />
          <span className="text-[12px] text-muted-foreground">/mo</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          data-testid="button-edit-rent"
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#1c242d] px-3.5 py-3 text-left"
        >
          <span className="text-[20px] font-extrabold tabular-nums text-foreground">
            {state.monthlyRent > 0 ? `${fmtUSD(state.monthlyRent)}/mo` : "—"}
          </span>
          <span className="text-[9px] font-bold tracking-wide text-accent">
            TAP TO EDIT
          </span>
        </button>
      )}

      {/* Use median CTA — appears once we have a median to apply. */}
      {medianRent != null && medianRent > 0 && (
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            onSelect(Math.round(medianRent));
          }}
          data-testid="button-use-median-rent"
          className="mb-3 self-start rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-[11px] font-bold text-accent transition-colors hover:bg-accent/15"
        >
          Use median ({fmtUSD(Math.round(medianRent))})
        </button>
      )}

      <RentCompsPanel
        loading={compsLoading}
        error={compsError}
        data={rentComps}
        onRetry={refetch}
        hasAddress={!!state.address}
      />
    </div>
  );
}

// --- Rent comps panel (inline on the rent step) --------------------------

function RentCompsPanel({
  loading,
  error,
  data,
  onRetry,
  hasAddress,
}: {
  loading: boolean;
  error: string | null;
  data: ReturnType<typeof useRentComps>["data"];
  onRetry: () => void;
  hasAddress: boolean;
}) {
  if (!hasAddress) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#1c242d] p-3 text-[11px] text-muted-foreground">
        Enter an address first to pull rent comps.
      </div>
    );
  }

  const median = data?.median ?? null;
  const low = data?.rentLow ?? null;
  const high = data?.rentHigh ?? null;

  return (
    <div className="rounded-xl border border-accent/20 bg-gradient-to-br from-accent/[0.06] to-transparent p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[9px] font-bold tracking-[0.16em] text-accent">
          RENT COMPS
        </span>
        <span className="text-[9px] font-bold tracking-wide text-muted-foreground">
          {data ? `${data.compCount} nearby · 0.5mi` : "5 nearby · 0.5mi"}
        </span>
      </div>

      {median != null && (
        <p className="mb-2.5 text-[11px] font-bold text-accent">
          Median: {fmtUSD(median)}
          {low != null && high != null && (
            <span className="font-medium text-accent/70">
              {" · "}Range: {fmtUSD(low)} – {fmtUSD(high)}
            </span>
          )}
        </p>
      )}

      {loading ? (
        <div className="space-y-1.5" data-testid="rent-comps-skeleton">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[34px] animate-pulse rounded-lg bg-white/[0.04]"
            />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">{error}</span>
          <button
            type="button"
            onClick={onRetry}
            data-testid="button-retry-rent-comps"
            className="font-bold text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      ) : data && data.comps.length > 0 ? (
        <ul className="space-y-1" data-testid="rent-comps-list">
          {data.comps.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#1c242d] px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-foreground">
                  {c.address || "Nearby rental"}
                </p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  {[
                    c.beds != null ? `${c.beds}bd` : null,
                    c.baths != null ? `${c.baths}ba` : null,
                    c.sqft != null ? `${c.sqft.toLocaleString()} sqft` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-extrabold tabular-nums text-foreground">
                  {fmtUSD(c.rent)}
                </p>
                <p className="mt-0.5 text-[9px] text-muted-foreground">
                  {c.distance > 0 ? `${c.distance.toFixed(1)}mi` : "—"}
                  {c.daysOld > 0 ? ` · ${c.daysOld}d` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No comps available for this area.
        </p>
      )}
    </div>
  );
}

// --- Step 5: Loan setup (all-in-one) -------------------------------------

type LoanEditing = null | "down" | "rate" | "term";

function StepLoan({
  state,
  update,
}: {
  state: HoldWizardState;
  update: (p: Partial<HoldWizardState>) => void;
}) {
  const [editing, setEditing] = useState<LoanEditing>(null);

  const downPayment = state.purchasePrice * (state.downPct / 100);
  const loanAmount = Math.max(0, state.purchasePrice - downPayment);

  // Live PITI
  const r = state.ratePct / 100 / 12;
  const n = state.termYears * 12;
  const pi =
    loanAmount > 0
      ? r === 0
        ? loanAmount / n
        : (loanAmount * r) / (1 - Math.pow(1 + r, -n))
      : 0;
  const annualTax = state.annualPropertyTax ?? estimatePropertyTax(state.purchasePrice);
  const monthlyTax = annualTax / 12;
  const monthlyIns = (state.purchasePrice * 0.005) / 12;
  const piti = pi + monthlyTax + monthlyIns;

  return (
    <div className="flex flex-1 flex-col">
      <StepHead
        eyebrow="LOAN · ALL-IN-ONE"
        title="Loan setup"
        help="Tap any row to edit. Defaults tuned for DMV DSCR loans."
      />

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1c242d]">
        <LoanRow
          label="Down payment"
          editing={editing === "down"}
          onToggle={() => setEditing(editing === "down" ? null : "down")}
          value={`${state.downPct}%`}
        >
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              inputMode="numeric"
              value={String(state.downPct)}
              onChange={(e) =>
                update({
                  downPct: Math.min(
                    100,
                    Number(e.target.value.replace(/[^\d]/g, "")) || 0,
                  ),
                })
              }
              className="w-20 rounded-lg border border-white/15 bg-[#232c37] px-2 py-1.5 text-[14px] font-bold tabular-nums text-foreground outline-none"
              data-testid="input-down"
            />
            <span className="text-[12px] text-muted-foreground">
              % · {fmtUSD(downPayment)}
            </span>
          </div>
        </LoanRow>

        <LoanRow
          label="Interest rate"
          editing={editing === "rate"}
          onToggle={() => setEditing(editing === "rate" ? null : "rate")}
          value={`${state.ratePct.toFixed(2)}%`}
        >
          <div className="flex items-center gap-2 pt-2">
            <input
              type="text"
              inputMode="decimal"
              value={String(state.ratePct)}
              onChange={(e) =>
                update({
                  ratePct: Math.min(
                    30,
                    Number(e.target.value.replace(/[^\d.]/g, "")) || 0,
                  ),
                })
              }
              className="w-20 rounded-lg border border-white/15 bg-[#232c37] px-2 py-1.5 text-[14px] font-bold tabular-nums text-foreground outline-none"
              data-testid="input-rate"
            />
            <span className="text-[12px] text-muted-foreground">% APR</span>
          </div>
        </LoanRow>

        <LoanRow
          label="Loan term"
          editing={editing === "term"}
          onToggle={() => setEditing(editing === "term" ? null : "term")}
          value={`${state.termYears} yr`}
        >
          <div className="flex gap-1.5 pt-2">
            {[15, 20, 25, 30].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  haptic();
                  update({ termYears: t });
                }}
                data-testid={`term-${t}`}
                className={cn(
                  "min-h-[40px] flex-1 rounded-lg border text-[12px] font-bold transition-colors",
                  state.termYears === t
                    ? "border-accent/55 bg-accent/15 text-accent"
                    : "border-white/10 bg-[#232c37] text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </LoanRow>

        {/* Computed rows */}
        <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
          <span className="text-[11px] font-bold text-muted-foreground">
            Loan amount
          </span>
          <span
            className="text-[14px] font-extrabold tabular-nums text-accent"
            data-testid="text-loan-amount"
          >
            {fmtUSD(loanAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <span className="text-[11px] font-bold text-muted-foreground">PITI</span>
          <span
            className="text-[14px] font-extrabold tabular-nums text-accent"
            data-testid="text-piti"
          >
            {fmtUSD(Math.round(piti))}/mo
          </span>
        </div>
      </div>
    </div>
  );
}

function LoanRow({
  label,
  value,
  editing,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  editing: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-b border-white/10 px-3.5 py-2.5",
        editing && "border-l-2 border-l-accent bg-accent/[0.05]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
        data-testid={`loan-row-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <span className="text-[11px] font-bold text-muted-foreground">
          {label}
        </span>
        <span className="text-[14px] font-extrabold tabular-nums text-foreground">
          {value}
          <span className="ml-2 text-[9px] font-bold text-accent">EDIT</span>
        </span>
      </button>
      {editing && children}
    </div>
  );
}

// --- Step 6: Reserves & vacancy ------------------------------------------

const RESERVE_ROWS = [
  { key: "vacancyPct", label: "Vacancy" },
  { key: "managementPct", label: "Property management" },
  { key: "maintenancePct", label: "Maintenance" },
  { key: "capexPct", label: "CapEx reserve" },
] as const;

function StepReserves({
  state,
  update,
}: {
  state: HoldWizardState;
  update: (p: Partial<HoldWizardState>) => void;
}) {
  const totalPct =
    state.vacancyPct + state.managementPct + state.maintenancePct + state.capexPct;
  const totalDollar = Math.round((state.monthlyRent * totalPct) / 100);

  function nudge(key: (typeof RESERVE_ROWS)[number]["key"], delta: number) {
    haptic();
    const next = Math.max(0, Math.min(50, (state[key] as number) + delta));
    update({ [key]: next } as Partial<HoldWizardState>);
  }

  return (
    <div className="flex flex-1 flex-col">
      <StepHead
        eyebrow="RESERVES"
        title="Reserves & vacancy"
        help="DMV-tuned defaults. Nudge with − / + if your area runs different."
      />

      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1c242d]">
        {RESERVE_ROWS.map((row) => {
          const v = state[row.key] as number;
          return (
            <div
              key={row.key}
              className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 last:border-b-0"
            >
              <span className="text-[11px] font-bold text-muted-foreground">
                {row.label}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => nudge(row.key, -1)}
                  data-testid={`minus-${row.key}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#232c37] text-foreground active:scale-95"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-[14px] font-extrabold tabular-nums text-foreground">
                  {v}%
                </span>
                <button
                  type="button"
                  onClick={() => nudge(row.key, 1)}
                  data-testid={`plus-${row.key}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#232c37] text-foreground active:scale-95"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-3">
        <span className="text-[11px] font-bold text-muted-foreground">
          Reserves
        </span>
        <span
          className="text-[15px] font-extrabold tabular-nums text-accent"
          data-testid="text-reserves-total"
        >
          {fmtUSD(totalDollar)}/mo total
        </span>
      </div>
    </div>
  );
}
