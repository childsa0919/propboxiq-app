import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  defaultDealInputs,
  dealInputsSchema,
  type Deal,
  type DealInputs,
} from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MoneyInput } from "@/components/MoneyInput";
import { MapPreview } from "@/components/MapPreview";
import { useToast } from "@/hooks/use-toast";
import { exportDealPdf } from "@/lib/exportPdf";
import {
  ArrowLeft,
  MapPin,
  Save,
  Download,
  TrendingUp,
  TrendingDown,
  Sliders,
  Building,
} from "lucide-react";

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const dealId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: deal, isLoading } = useQuery<Deal>({
    queryKey: ["/api/deals", dealId],
    enabled: Number.isFinite(dealId),
  });

  const [inputs, setInputs] = useState<DealInputs>(defaultDealInputs);
  const [notes, setNotes] = useState("");
  const [propMeta, setPropMeta] = useState<{
    beds?: number | null;
    baths?: number | null;
    sqft?: number | null;
    yearBuilt?: number | null;
  }>({});
  const [dirty, setDirty] = useState(false);

  // Hydrate from server
  useEffect(() => {
    if (!deal) return;
    try {
      const parsed = dealInputsSchema.safeParse(JSON.parse(deal.inputs));
      if (parsed.success) setInputs({ ...defaultDealInputs, ...parsed.data });
    } catch {
      setInputs(defaultDealInputs);
    }
    setNotes(deal.notes ?? "");
    setPropMeta({
      beds: deal.beds,
      baths: deal.baths,
      sqft: deal.sqft,
      yearBuilt: deal.yearBuilt,
    });
    setDirty(false);
  }, [deal]);

  const update = (patch: Partial<DealInputs>) => {
    setInputs((s) => ({ ...s, ...patch }));
    setDirty(true);
  };

  const results = useMemo(() => calculateDeal(inputs), [inputs]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!deal) return;
      const body = {
        inputs: JSON.stringify(inputs),
        notes,
        beds: propMeta.beds ?? null,
        baths: propMeta.baths ?? null,
        sqft: propMeta.sqft ?? null,
        yearBuilt: propMeta.yearBuilt ?? null,
      };
      const res = await apiRequest("PATCH", `/api/deals/${deal.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals", dealId] });
      toast({ title: "Deal saved" });
    },
  });

  if (isLoading || !deal) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <div className="h-8 w-40 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            aria-label="Back"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-0.5">
              <MapPin className="h-3 w-3" />
              <span className="truncate">
                {deal.city}
                {deal.city && deal.state ? ", " : ""}
                {deal.state} {deal.zip}
              </span>
            </div>
            <h1
              className="text-lg font-semibold truncate"
              data-testid="text-deal-address"
            >
              {deal.address}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => exportDealPdf(deal, inputs)}
            data-testid="button-export-pdf"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!dirty || saveMut.isPending}
            data-testid="button-save"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMut.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left: Inputs */}
        <div className="space-y-6">
          {/* Property */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Building className="h-4 w-4" /> Property
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-[1fr_220px]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <PropField
                    label="Beds"
                    value={propMeta.beds ?? ""}
                    onChange={(v) => {
                      setPropMeta((p) => ({ ...p, beds: v }));
                      setDirty(true);
                    }}
                    testId="input-beds"
                  />
                  <PropField
                    label="Baths"
                    value={propMeta.baths ?? ""}
                    step={0.5}
                    onChange={(v) => {
                      setPropMeta((p) => ({ ...p, baths: v }));
                      setDirty(true);
                    }}
                    testId="input-baths"
                  />
                  <PropField
                    label="Sq ft"
                    value={propMeta.sqft ?? ""}
                    onChange={(v) => {
                      setPropMeta((p) => ({ ...p, sqft: v }));
                      setDirty(true);
                    }}
                    testId="input-sqft"
                  />
                  <PropField
                    label="Year built"
                    value={propMeta.yearBuilt ?? ""}
                    onChange={(v) => {
                      setPropMeta((p) => ({ ...p, yearBuilt: v }));
                      setDirty(true);
                    }}
                    testId="input-year"
                  />
                </div>
                {deal.lat != null && deal.lon != null && (
                  <MapPreview
                    lat={deal.lat}
                    lon={deal.lon}
                    className="aspect-[16/10] sm:aspect-[3/2]"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Numbers */}
          <Tabs defaultValue="acquisition">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="acquisition" data-testid="tab-acquisition">
                Acquisition
              </TabsTrigger>
              <TabsTrigger value="rehab" data-testid="tab-rehab">
                Rehab & Hold
              </TabsTrigger>
              <TabsTrigger value="financing" data-testid="tab-financing">
                Financing
              </TabsTrigger>
              <TabsTrigger value="exit" data-testid="tab-exit">
                Exit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="acquisition" className="mt-4">
              <Card>
                <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
                  <MoneyInput
                    label="Purchase price"
                    prefix="$"
                    value={inputs.purchasePrice}
                    onChange={(n) => update({ purchasePrice: n })}
                    testId="input-purchase-price"
                  />
                  <MoneyInput
                    label="ARV (after-repair value)"
                    prefix="$"
                    value={inputs.arv}
                    onChange={(n) => update({ arv: n })}
                    hint="Your projected sale price after rehab"
                    testId="input-arv"
                  />
                  <MoneyInput
                    label="Buy closing costs"
                    suffix="%"
                    step={0.1}
                    max={15}
                    value={inputs.buyClosingPct}
                    onChange={(n) => update({ buyClosingPct: n })}
                    hint={`≈ ${fmtUSD(results.buyClosing)} on this deal`}
                    testId="input-buy-closing"
                  />
                  <MoneyInput
                    label="Desired profit (for MAO)"
                    suffix="%"
                    step={0.5}
                    max={50}
                    value={inputs.desiredProfitPct}
                    onChange={(n) => update({ desiredProfitPct: n })}
                    hint={`≈ ${fmtUSD(
                      inputs.arv * (inputs.desiredProfitPct / 100)
                    )} target profit`}
                    testId="input-desired-profit"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rehab" className="mt-4">
              <Card>
                <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
                  <MoneyInput
                    label="Rehab budget"
                    prefix="$"
                    value={inputs.rehabBudget}
                    onChange={(n) => update({ rehabBudget: n })}
                    testId="input-rehab-budget"
                  />
                  <MoneyInput
                    label="Rehab contingency"
                    suffix="%"
                    step={1}
                    max={50}
                    value={inputs.rehabContingencyPct}
                    onChange={(n) => update({ rehabContingencyPct: n })}
                    hint={`+ ${fmtUSD(results.rehabContingency)} buffer`}
                    testId="input-rehab-contingency"
                  />
                  <MoneyInput
                    label="Holding period (months)"
                    value={inputs.holdingMonths}
                    onChange={(n) => update({ holdingMonths: n })}
                    step={1}
                    max={60}
                    testId="input-holding-months"
                  />
                  <MoneyInput
                    label="Monthly holding costs"
                    prefix="$"
                    value={inputs.monthlyHoldingCosts}
                    onChange={(n) => update({ monthlyHoldingCosts: n })}
                    hint="Taxes, insurance, utilities"
                    testId="input-monthly-holding"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financing" className="mt-4">
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">
                        Financing type
                      </Label>
                      <Select
                        value={inputs.financingType}
                        onValueChange={(v) =>
                          update({
                            financingType: v as DealInputs["financingType"],
                          })
                        }
                      >
                        <SelectTrigger data-testid="select-financing-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hard_money">
                            Hard money
                          </SelectItem>
                          <SelectItem value="cash">All cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {inputs.financingType === "hard_money" && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <MoneyInput
                        label="Loan-to-cost (LTC)"
                        suffix="%"
                        step={1}
                        max={100}
                        value={inputs.loanLtcPct}
                        onChange={(n) => update({ loanLtcPct: n })}
                        hint={`≈ ${fmtUSD(results.loanAmount)} loan`}
                        testId="input-ltc"
                      />
                      <MoneyInput
                        label="Interest rate"
                        suffix="%"
                        step={0.25}
                        max={30}
                        value={inputs.loanRatePct}
                        onChange={(n) => update({ loanRatePct: n })}
                        hint={`≈ ${fmtUSD(results.interestCost)} over ${
                          inputs.holdingMonths
                        } mo`}
                        testId="input-rate"
                      />
                      <MoneyInput
                        label="Origination points"
                        suffix="%"
                        step={0.25}
                        max={10}
                        value={inputs.loanPointsPct}
                        onChange={(n) => update({ loanPointsPct: n })}
                        hint={`≈ ${fmtUSD(results.loanPoints)}`}
                        testId="input-points"
                      />
                      <MoneyInput
                        label="Loan fees"
                        prefix="$"
                        value={inputs.loanFees}
                        onChange={(n) => update({ loanFees: n })}
                        testId="input-loan-fees"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="exit" className="mt-4">
              <Card>
                <CardContent className="p-5 grid gap-4 sm:grid-cols-2">
                  <MoneyInput
                    label="Sell closing costs"
                    suffix="%"
                    step={0.1}
                    max={15}
                    value={inputs.sellClosingPct}
                    onChange={(n) => update({ sellClosingPct: n })}
                    hint={`≈ ${fmtUSD(results.sellClosing)} of ARV`}
                    testId="input-sell-closing"
                  />
                  <MoneyInput
                    label="Agent commission"
                    suffix="%"
                    step={0.5}
                    max={15}
                    value={inputs.agentCommissionPct}
                    onChange={(n) => update({ agentCommissionPct: n })}
                    hint={`≈ ${fmtUSD(results.agentCommission)}`}
                    testId="input-commission"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Sensitivity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Sliders className="h-4 w-4" /> Sensitivity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Sensitivity
                label="ARV scenario"
                base={inputs.arv}
                current={inputs.arv}
                min={inputs.arv * 0.7}
                max={inputs.arv * 1.3}
                step={Math.max(1000, Math.round(inputs.arv / 200))}
                onChange={(v) => update({ arv: v })}
              />
              <Sensitivity
                label="Rehab cost"
                base={inputs.rehabBudget}
                current={inputs.rehabBudget}
                min={inputs.rehabBudget * 0.5}
                max={inputs.rehabBudget * 2}
                step={Math.max(500, Math.round(inputs.rehabBudget / 200))}
                onChange={(v) => update({ rehabBudget: v })}
              />
              <Sensitivity
                label="Hold time (months)"
                base={inputs.holdingMonths}
                current={inputs.holdingMonths}
                min={1}
                max={24}
                step={1}
                onChange={(v) => update({ holdingMonths: v })}
                isInteger
              />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Comps used, contractor bids, scope notes, exit strategy…"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                rows={4}
                data-testid="input-notes"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: Sticky results */}
        <div className="lg:sticky lg:top-20 self-start space-y-4">
          <ResultsPanel inputs={inputs} />
        </div>
      </div>
    </div>
  );
}

function PropField({
  label,
  value,
  onChange,
  step = 1,
  testId,
}: {
  label: string;
  value: number | "" | null;
  onChange: (v: number | null) => void;
  step?: number;
  testId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : parseFloat(e.target.value))
        }
        className="tabular-nums"
        data-testid={testId}
      />
    </div>
  );
}

function Sensitivity({
  label,
  base,
  current,
  min,
  max,
  step,
  onChange,
  isInteger,
}: {
  label: string;
  base: number;
  current: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  isInteger?: boolean;
}) {
  const safeStep = Math.max(step, isInteger ? 1 : 1);
  const safeMin = Math.max(0, min);
  const safeMax = Math.max(safeMin + safeStep, max);
  // If base is 0, slider is meaningless — disable visually.
  const disabled = !(safeMax > safeMin);
  const fmt = isInteger ? (n: number) => `${Math.round(n)}` : (n: number) => fmtUSD(n);
  // Clamp current within range to prevent radix from emitting onChange storms
  const clamped = Math.min(Math.max(current, safeMin), safeMax);
  return (
    <div className={disabled ? "opacity-50" : ""}>
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        <span className="text-sm font-semibold tabular-nums">
          {fmt(current)}
        </span>
      </div>
      <Slider
        min={safeMin}
        max={safeMax}
        step={safeStep}
        value={[clamped]}
        disabled={disabled}
        onValueChange={(v) => {
          const next = v[0];
          if (next !== current) onChange(next);
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground mt-1.5 tabular-nums">
        <span>{fmt(safeMin)}</span>
        <span>Base: {fmt(base)}</span>
        <span>{fmt(safeMax)}</span>
      </div>
    </div>
  );
}

function ResultsPanel({ inputs }: { inputs: DealInputs }) {
  const r = calculateDeal(inputs);
  const profitable = r.netProfit >= 0;
  const goodMargin = r.profitMarginPct >= 15;

  return (
    <Card className="border-2">
      <CardHeader className="pb-3 border-b border-card-border">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          {profitable ? (
            <TrendingUp className="h-4 w-4 text-accent" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
          Deal results
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        {/* Hero KPI */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Net profit</p>
          <p
            className={`text-3xl font-semibold tabular-nums ${
              profitable ? "text-accent" : "text-destructive"
            }`}
            data-testid="text-net-profit"
          >
            {fmtUSD(r.netProfit)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {fmtPct(r.profitMarginPct)} margin on ARV
            {goodMargin && profitable ? " · healthy" : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="ROI on cash" value={fmtPct(r.roiOnCash)} />
          <Stat label="Annualized" value={fmtPct(r.annualizedRoi)} />
          <Stat label="Cash invested" value={fmtUSD(r.totalCashInvested)} />
          <Stat label="Loan amount" value={fmtUSD(r.loanAmount)} />
        </div>

        <div className="pt-4 border-t border-card-border space-y-2 text-sm">
          <RowLine label="Total project cost" value={fmtUSD(r.totalProjectCost)} />
          <RowLine label="Sale price (ARV)" value={fmtUSD(inputs.arv)} />
          <RowLine
            label="Break-even ARV"
            value={fmtUSD(r.breakEvenArv)}
            muted
          />
        </div>

        <div className="pt-4 border-t border-card-border">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Decision
          </p>
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Max allowable offer at {inputs.desiredProfitPct}% target profit
            </p>
            <p
              className="text-xl font-semibold tabular-nums mt-0.5"
              data-testid="text-mao"
            >
              {fmtUSD(r.maxAllowableOffer)}
            </p>
            {inputs.purchasePrice > 0 && r.maxAllowableOffer > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {inputs.purchasePrice <= r.maxAllowableOffer
                  ? `Your offer is ${fmtUSD(
                      r.maxAllowableOffer - inputs.purchasePrice
                    )} below MAO`
                  : `Your offer is ${fmtUSD(
                      inputs.purchasePrice - r.maxAllowableOffer
                    )} above MAO`}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function RowLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""}`}>
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          muted ? "text-muted-foreground" : "font-medium"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
