import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import {
  MapPin,
  Trash2,
  ArrowRight,
  Search,
  SlidersHorizontal,
  X,
  GitCompareArrows,
  Plus,
  Check,
} from "lucide-react";

type SortKey = "newest" | "profit" | "roi" | "address";
type ProfitFilter = "all" | "profitable" | "unprofitable";
type DataFilter = "all" | "has-comps" | "missing-data";

interface EnrichedDeal {
  deal: Deal;
  inputs: ReturnType<typeof parseInputs>;
  results: ReturnType<typeof calculateDeal>;
  profitable: boolean;
  hasNumbers: boolean;
  hasComps: boolean;
}

function parseInputs(deal: Deal) {
  try {
    return { ...defaultDealInputs, ...JSON.parse(deal.inputs) };
  } catch {
    return defaultDealInputs;
  }
}

export default function Deals() {
  const [, navigate] = useLocation();
  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [profitFilter, setProfitFilter] = useState<ProfitFilter>("all");
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCompare, setShowCompare] = useState(false);

  const deleteDeal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/deals/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] }),
  });

  const enriched: EnrichedDeal[] = useMemo(() => {
    return deals.map((d) => {
      const inputs = parseInputs(d);
      const results = calculateDeal(inputs, { state: d.state, city: d.city });
      const hasNumbers = inputs.purchasePrice > 0 && inputs.arv > 0;
      // "has comps" — deal has been priced (ARV present) which means comps were pulled
      const hasComps = inputs.arv > 0;
      return {
        deal: d,
        inputs,
        results,
        profitable: results.netProfit > 0,
        hasNumbers,
        hasComps,
      };
    });
  }, [deals]);

  const filtered: EnrichedDeal[] = useMemo(() => {
    let list = enriched;

    // Search
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((e) => {
        const hay = [
          e.deal.address,
          e.deal.city ?? "",
          e.deal.state ?? "",
          e.deal.zip ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    // Profit filter
    if (profitFilter === "profitable") {
      list = list.filter((e) => e.hasNumbers && e.profitable);
    } else if (profitFilter === "unprofitable") {
      list = list.filter((e) => e.hasNumbers && !e.profitable);
    }

    // Data filter
    if (dataFilter === "has-comps") {
      list = list.filter((e) => e.hasComps);
    } else if (dataFilter === "missing-data") {
      list = list.filter((e) => !e.hasNumbers);
    }

    // Sort
    list = [...list];
    switch (sort) {
      case "newest":
        list.sort((a, b) => b.deal.updatedAt - a.deal.updatedAt);
        break;
      case "profit":
        list.sort((a, b) => b.results.netProfit - a.results.netProfit);
        break;
      case "roi":
        list.sort((a, b) => b.results.roiOnCash - a.results.roiOnCash);
        break;
      case "address":
        list.sort((a, b) =>
          a.deal.address.localeCompare(b.deal.address, undefined, {
            sensitivity: "base",
          }),
        );
        break;
    }
    return list;
  }, [enriched, search, sort, profitFilter, dataFilter]);

  const activeFilterCount =
    (profitFilter !== "all" ? 1 : 0) + (dataFilter !== "all" ? 1 : 0);

  const selectedDeals = useMemo(
    () => enriched.filter((e) => selected.has(e.deal.id)),
    [enriched, selected],
  );

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 4) return next; // cap at 4
        next.add(id);
      }
      return next;
    });
  }

  function exitCompareMode() {
    setCompareMode(false);
    setSelected(new Set());
    setShowCompare(false);
  }

  const totals = useMemo(() => {
    const withNums = enriched.filter((e) => e.hasNumbers);
    const totalProfit = withNums.reduce(
      (acc, e) => acc + e.results.netProfit,
      0,
    );
    const profitable = withNums.filter((e) => e.profitable).length;
    return {
      total: deals.length,
      withNums: withNums.length,
      profitable,
      totalProfit,
    };
  }, [enriched, deals.length]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 pb-24">
      {/* Header */}
      <header className="mb-5 sm:mb-7">
        <div className="flex items-end justify-between gap-3 mb-1">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Saved deals
          </h1>
          {!compareMode && deals.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompareMode(true)}
              data-testid="button-enter-compare"
            >
              <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" />
              Compare
            </Button>
          )}
          {compareMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={exitCompareMode}
              data-testid="button-exit-compare"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {compareMode ? (
            <span data-testid="text-compare-hint">
              Select up to 4 deals to compare side-by-side ({selected.size}/4)
            </span>
          ) : (
            <>
              <span data-testid="text-deal-count">
                {totals.total} {totals.total === 1 ? "deal" : "deals"}
              </span>
              {totals.withNums > 0 && (
                <span className="text-muted-foreground/80">
                  {" · "}
                  {totals.profitable} profitable · combined est.{" "}
                  <span
                    className={
                      totals.totalProfit >= 0
                        ? "text-[hsl(var(--success))] font-medium"
                        : "text-destructive font-medium"
                    }
                  >
                    {fmtUSD(totals.totalProfit)}
                  </span>
                </span>
              )}
            </>
          )}
        </p>
      </header>

      {/* Search + sort + filters */}
      {!compareMode && (
        <div className="mb-5 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              placeholder="Search address, city, ZIP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10"
              data-testid="input-search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                data-testid="button-clear-search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
            >
              <SelectTrigger
                className="h-10 flex-1"
                data-testid="select-sort"
              >
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest" data-testid="sort-newest">
                  Newest first
                </SelectItem>
                <SelectItem value="profit" data-testid="sort-profit">
                  Biggest profit
                </SelectItem>
                <SelectItem value="roi" data-testid="sort-roi">
                  Best ROI
                </SelectItem>
                <SelectItem value="address" data-testid="sort-address">
                  Address (A–Z)
                </SelectItem>
              </SelectContent>
            </Select>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  className="h-10 relative"
                  data-testid="button-open-filters"
                >
                  <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                  Filter
                  {activeFilterCount > 0 && (
                    <span
                      className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold"
                      data-testid="badge-filter-count"
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader className="text-left mb-4">
                  <SheetTitle>Filter deals</SheetTitle>
                </SheetHeader>
                <div className="space-y-5 pb-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                      Profitability
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { v: "all", l: "All" },
                          { v: "profitable", l: "Profitable" },
                          { v: "unprofitable", l: "Unprofitable" },
                        ] as { v: ProfitFilter; l: string }[]
                      ).map((opt) => (
                        <Button
                          key={opt.v}
                          variant={
                            profitFilter === opt.v ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setProfitFilter(opt.v)}
                          data-testid={`filter-profit-${opt.v}`}
                        >
                          {opt.l}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                      Data
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { v: "all", l: "All" },
                          { v: "has-comps", l: "Has comps" },
                          { v: "missing-data", l: "Missing data" },
                        ] as { v: DataFilter; l: string }[]
                      ).map((opt) => (
                        <Button
                          key={opt.v}
                          variant={
                            dataFilter === opt.v ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => setDataFilter(opt.v)}
                          data-testid={`filter-data-${opt.v}`}
                        >
                          {opt.l}
                        </Button>
                      ))}
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setProfitFilter("all");
                        setDataFilter("all");
                      }}
                      className="w-full"
                      data-testid="button-clear-filters"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4 h-28" />
            </Card>
          ))}
        </div>
      ) : deals.length === 0 ? (
        <EmptyState navigate={navigate} variant="no-deals" />
      ) : filtered.length === 0 ? (
        <EmptyState
          navigate={navigate}
          variant="no-results"
          onClear={() => {
            setSearch("");
            setProfitFilter("all");
            setDataFilter("all");
          }}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <DealRow
              key={e.deal.id}
              enriched={e}
              compareMode={compareMode}
              selected={selected.has(e.deal.id)}
              onToggleSelect={() => toggleSelect(e.deal.id)}
              onOpen={() => navigate(`/result/${e.deal.id}`)}
              onDelete={() => deleteDeal.mutate(e.deal.id)}
            />
          ))}
        </div>
      )}

      {/* Compare action bar */}
      {compareMode && selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-card-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              onClick={() => setShowCompare(true)}
              disabled={selected.size < 2}
              data-testid="button-open-compare"
            >
              Compare {selected.size} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Compare drawer */}
      <Sheet
        open={showCompare}
        onOpenChange={(open) => !open && setShowCompare(false)}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[92dvh] overflow-y-auto"
        >
          <SheetHeader className="text-left mb-4">
            <SheetTitle>Compare deals</SheetTitle>
          </SheetHeader>
          <CompareTable items={selectedDeals} navigate={navigate} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DealRow({
  enriched,
  compareMode,
  selected,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  enriched: EnrichedDeal;
  compareMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { deal, inputs, results, profitable, hasNumbers } = enriched;

  const handleClick = () => {
    if (compareMode) {
      onToggleSelect();
    } else {
      onOpen();
    }
  };

  return (
    <Card
      className={`group cursor-pointer hover-elevate transition-all ${
        compareMode && selected
          ? "ring-2 ring-accent border-accent"
          : ""
      }`}
      onClick={handleClick}
      data-testid={`card-deal-${deal.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {compareMode && (
            <div
              className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                selected
                  ? "bg-accent border-accent text-accent-foreground"
                  : "border-input bg-background"
              }`}
              aria-hidden
            >
              {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </div>
          )}
          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium leading-snug line-clamp-2"
              data-testid={`text-address-${deal.id}`}
            >
              {deal.address}
            </p>
            {deal.city && deal.state && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {deal.city}, {deal.state} {deal.zip}
              </p>
            )}
            {(deal.sqft || deal.beds != null || deal.baths != null) && (
              <p
                className="text-[11px] text-muted-foreground mt-0.5 tabular-nums"
                data-testid={`text-facts-${deal.id}`}
              >
                {[
                  deal.sqft ? `${deal.sqft.toLocaleString()} sqft` : null,
                  deal.beds != null ? `${deal.beds} bd` : null,
                  deal.baths != null ? `${deal.baths} ba` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          {!compareMode && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this deal?")) onDelete();
              }}
              className="opacity-60 sm:opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
              aria-label="Delete deal"
              data-testid={`button-delete-${deal.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {hasNumbers ? (
          <div className="mt-3 pt-3 border-t border-card-border grid grid-cols-3 gap-2">
            <Metric
              label="Profit"
              value={fmtUSD(results.netProfit)}
              tone={profitable ? "good" : "bad"}
              testId={`metric-profit-${deal.id}`}
            />
            <Metric
              label="ROI"
              value={fmtPct(results.roiOnCash)}
              testId={`metric-roi-${deal.id}`}
            />
            <Metric
              label="ARV"
              value={fmtUSD(inputs.arv)}
              testId={`metric-arv-${deal.id}`}
            />
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-card-border">
            <div className="text-xs text-muted-foreground">
              Numbers not entered yet
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            Updated {new Date(deal.updatedAt).toLocaleDateString()}
          </span>
          {!compareMode && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  testId?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-[hsl(var(--success))]"
      : tone === "bad"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-sm font-semibold tabular-nums truncate ${toneClass}`}
        data-testid={testId}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  navigate,
  variant,
  onClear,
}: {
  navigate: (path: string) => void;
  variant: "no-deals" | "no-results";
  onClear?: () => void;
}) {
  if (variant === "no-deals") {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-secondary flex items-center justify-center">
            <Plus className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium mb-1">No saved deals yet</p>
            <p className="text-xs text-muted-foreground">
              Analyze a flip and it will show up here.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/quick")}
            data-testid="button-empty-analyze"
          >
            Analyze a flip
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-8 text-center space-y-3">
        <p className="text-sm font-medium">No matches</p>
        <p className="text-xs text-muted-foreground">
          Try a different search or clear your filters.
        </p>
        {onClear && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            data-testid="button-empty-clear"
          >
            Clear all
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function CompareTable({
  items,
  navigate,
}: {
  items: EnrichedDeal[];
  navigate: (path: string) => void;
}) {
  if (items.length < 2) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Pick at least 2 deals to compare.
      </p>
    );
  }

  // Find best per row to highlight
  const bestProfit = Math.max(...items.map((i) => i.results.netProfit));
  const bestRoi = Math.max(...items.map((i) => i.results.roiOnCash));
  const bestAnnRoi = Math.max(...items.map((i) => i.results.annualizedRoi));
  const bestMargin = Math.max(...items.map((i) => i.results.profitMarginPct));
  const lowestCash = Math.min(
    ...items.map((i) => i.results.totalCashInvested),
  );

  type Row = {
    label: string;
    fmt: (e: EnrichedDeal) => string;
    best?: (e: EnrichedDeal) => boolean;
    tone?: (e: EnrichedDeal) => "good" | "bad" | undefined;
  };

  const rows: Row[] = [
    {
      label: "Net profit",
      fmt: (e) => fmtUSD(e.results.netProfit),
      best: (e) =>
        items.length > 1 && e.results.netProfit === bestProfit && bestProfit > 0,
      tone: (e) => (e.results.netProfit > 0 ? "good" : "bad"),
    },
    {
      label: "ROI on cash",
      fmt: (e) => fmtPct(e.results.roiOnCash),
      best: (e) =>
        items.length > 1 && e.results.roiOnCash === bestRoi && bestRoi > 0,
    },
    {
      label: "Annualized ROI",
      fmt: (e) => fmtPct(e.results.annualizedRoi),
      best: (e) =>
        items.length > 1 &&
        e.results.annualizedRoi === bestAnnRoi &&
        bestAnnRoi > 0,
    },
    {
      label: "Profit margin",
      fmt: (e) => fmtPct(e.results.profitMarginPct),
      best: (e) =>
        items.length > 1 &&
        e.results.profitMarginPct === bestMargin &&
        bestMargin > 0,
    },
    {
      label: "ARV",
      fmt: (e) => fmtUSD(e.inputs.arv),
    },
    {
      label: "Purchase",
      fmt: (e) => fmtUSD(e.inputs.purchasePrice),
    },
    {
      label: "Rehab",
      fmt: (e) => fmtUSD(e.inputs.rehabBudget),
    },
    {
      label: "Total project cost",
      fmt: (e) => fmtUSD(e.results.totalProjectCost),
    },
    {
      label: "Cash invested",
      fmt: (e) => fmtUSD(e.results.totalCashInvested),
      best: (e) =>
        items.length > 1 && e.results.totalCashInvested === lowestCash,
    },
    {
      label: "Hold (months)",
      fmt: (e) => `${e.inputs.holdingMonths}`,
    },
    {
      label: "Sqft",
      fmt: (e) => (e.deal.sqft ? e.deal.sqft.toLocaleString() : "—"),
    },
    {
      label: "Beds / Baths",
      fmt: (e) =>
        e.deal.beds != null && e.deal.baths != null
          ? `${e.deal.beds} / ${e.deal.baths}`
          : "—",
    },
    {
      label: "Max offer (MAO)",
      fmt: (e) => fmtUSD(e.results.maxAllowableOffer),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Headers row — addresses */}
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `90px repeat(${items.length}, minmax(0,1fr))`,
        }}
      >
        <div />
        {items.map((e) => (
          <button
            key={e.deal.id}
            onClick={() => navigate(`/result/${e.deal.id}`)}
            className="text-left rounded-lg p-2 hover-elevate"
            data-testid={`compare-header-${e.deal.id}`}
          >
            <p className="text-[11px] font-semibold leading-tight line-clamp-2">
              {e.deal.address}
            </p>
            {e.deal.city && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {e.deal.city}, {e.deal.state}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Metric rows */}
      <div className="rounded-xl border border-card-border overflow-hidden">
        {rows.map((row, idx) => (
          <div
            key={row.label}
            className={`grid gap-2 items-center px-2 py-2.5 ${
              idx % 2 === 0 ? "bg-muted/30" : ""
            }`}
            style={{
              gridTemplateColumns: `90px repeat(${items.length}, minmax(0,1fr))`,
            }}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground pl-1">
              {row.label}
            </span>
            {items.map((e) => {
              const isBest = row.best?.(e);
              const tone = row.tone?.(e);
              const toneClass =
                tone === "good"
                  ? "text-[hsl(var(--success))]"
                  : tone === "bad"
                    ? "text-destructive"
                    : "text-foreground";
              return (
                <div
                  key={e.deal.id}
                  className={`text-sm font-semibold tabular-nums truncate px-1 ${toneClass} ${
                    isBest
                      ? "relative before:content-[''] before:absolute before:-left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-1 before:rounded-r before:bg-accent"
                      : ""
                  }`}
                  data-testid={`compare-${row.label.toLowerCase().replace(/\s+/g, "-")}-${e.deal.id}`}
                >
                  {row.fmt(e)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <span className="h-3 w-1 rounded bg-accent" />
        Best in row
      </p>
    </div>
  );
}
