import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import {
  AddressAutocomplete,
  type AddressMatch,
} from "@/components/AddressAutocomplete";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import {
  ArrowRight,
  Trash2,
  MapPin,
  TrendingUp,
  Plus,
  Building2,
} from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const [pending, setPending] = useState(false);

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const createDeal = useMutation({
    mutationFn: async (vars: { match: AddressMatch }) => {
      const { match } = vars;
      const body = {
        address: match.matchedAddress,
        city: match.components.city ?? null,
        state: match.components.state ?? null,
        zip: match.components.zip ?? null,
        lat: match.lat,
        lon: match.lon,
        beds: null,
        baths: null,
        sqft: null,
        yearBuilt: null,
        inputs: JSON.stringify(defaultDealInputs),
        notes: null,
      };
      const res = await apiRequest("POST", "/api/deals", body);
      return res.json() as Promise<Deal>;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      navigate(`/deal/${deal.id}`);
    },
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/deals/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] }),
  });

  function handleSelect(match: AddressMatch) {
    setPending(true);
    createDeal.mutate({ match });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
      {/* Hero address bar */}
      <section className="mb-12">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Fix-and-flip deal analyzer
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
            Analyze a flip in 30 seconds.
          </h1>
          <p className="text-base text-muted-foreground mb-6 max-w-xl">
            Enter the property address. We'll standardize it and pull the map
            location — you focus on the numbers that matter: ARV, rehab,
            financing, and profit.
          </p>
          <AddressAutocomplete
            autoFocus
            placeholder="Start typing an address (e.g. 1600 Pennsylvania Ave Washington DC)"
            onSelect={handleSelect}
          />
          {pending && (
            <p className="mt-3 text-sm text-muted-foreground">
              Creating deal…
            </p>
          )}
        </div>
      </section>

      {/* Saved deals */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Your deals</h2>
            <p className="text-sm text-muted-foreground">
              {deals.length === 0
                ? "No deals yet — enter an address above to get started."
                : `${deals.length} ${deals.length === 1 ? "deal" : "deals"} saved`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-40 rounded-lg border border-card-border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((d) => (
              <DealCard
                key={d.id}
                deal={d}
                onOpen={() => navigate(`/deal/${d.id}`)}
                onDelete={() => deleteDeal.mutate(d.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-card-border bg-card/50 p-10 text-center">
      <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        Saved deals appear here. Each deal includes a sources & uses
        breakdown, profit estimate, and one-click investor PDF.
      </p>
    </div>
  );
}

function DealCard({
  deal,
  onOpen,
  onDelete,
}: {
  deal: Deal;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const inputs = (() => {
    try {
      return { ...defaultDealInputs, ...JSON.parse(deal.inputs) };
    } catch {
      return defaultDealInputs;
    }
  })();
  const r = calculateDeal(inputs);
  const profitable = r.netProfit > 0;
  const hasNumbers = inputs.purchasePrice > 0 && inputs.arv > 0;

  return (
    <Card
      className="group cursor-pointer hover-elevate transition-shadow"
      onClick={onOpen}
      data-testid={`card-deal-${deal.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-2 mb-3">
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
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("Delete this deal?")) onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
            aria-label="Delete deal"
            data-testid={`button-delete-${deal.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {hasNumbers ? (
          <div className="space-y-1.5 pt-3 border-t border-card-border">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Net profit</span>
              <span
                className={`text-base font-semibold tabular-nums ${
                  profitable ? "text-accent" : "text-destructive"
                }`}
              >
                {fmtUSD(r.netProfit)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                ROI on cash
              </span>
              <span className="text-xs font-medium tabular-nums">
                {fmtPct(r.roiOnCash)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Purchase</span>
              <span className="text-xs tabular-nums">
                {fmtUSD(inputs.purchasePrice)}
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-card-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              Add deal numbers to see returns
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {new Date(deal.updatedAt).toLocaleDateString()}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            Open <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
