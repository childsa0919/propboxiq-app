import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import { ArrowRight, MapPin, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { DealCard as PreviewDealCard } from "@/components/DealCard";

/**
 * Welcome — Direction A · Coastal Teal.
 *
 * Layout (top → bottom):
 *   - REAL ESTATE INTELLIGENCE eyebrow
 *   - "Run the math before you offer." hero headline
 *   - Subhead: Three numbers. Six seconds. ...
 *   - Deal Card preview with sample data (ARV + ROI)
 *   - Score a property primary CTA → /quick
 *   - Saved deals list (preserved)
 */
export default function Welcome() {
  const [, navigate] = useLocation();
  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/deals/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] }),
  });

  return (
    <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-14">
      {/* Hero */}
      <section className="relative mb-8 sm:mb-10">
        <div className="mono-eyebrow mb-4">Real estate intelligence</div>
        <h1
          className="font-display font-bold leading-[1.02] tracking-[-0.025em] text-[34px] sm:text-[44px] mb-4"
          style={{ color: "var(--brand-ink, currentColor)" }}
        >
          <span className="text-foreground">Run the math </span>
          <br className="hidden sm:block" />
          <span className="text-foreground">before you offer.</span>
        </h1>
        <p className="text-[15px] text-muted-foreground max-w-xl leading-relaxed">
          Three numbers. Six seconds. Real comps from Anne Arundel to DC.
        </p>
      </section>

      {/* Deal Card preview */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <PreviewDealCard
          score={82}
          address="1247 Westfield Dr · Bowie MD"
          stats={[
            { label: "ARV", value: "$485K" },
            { label: "ROI", value: "34%" },
          ]}
        />
      </motion.section>

      {/* Primary + secondary CTAs */}
      <section className="flex flex-col gap-3 mb-12">
        <Link href="/quick" data-testid="link-mode-quick">
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl
                       bg-primary text-primary-foreground
                       px-6 py-4 text-base font-semibold
                       shadow-[0_10px_30px_-12px_rgba(18,109,133,0.55)]
                       hover:opacity-95 active:scale-[0.99] transition-all"
          >
            Score a property
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </Link>
        <Link href="/detailed" data-testid="link-mode-detailed">
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl
                       border border-card-border bg-card/40 backdrop-blur
                       px-6 py-3.5 text-sm font-medium text-foreground
                       hover-elevate active:scale-[0.99] transition-all"
          >
            Switch to detailed mode
          </button>
        </Link>
      </section>

      {/* Saved deals — preserved */}
      {deals.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <div className="mono-eyebrow mb-1">Pipeline</div>
              <h2 className="text-lg font-semibold tracking-tight">
                Your saved deals
              </h2>
              <p className="text-xs text-muted-foreground">
                {deals.length === 1
                  ? "1 deal saved"
                  : `${deals.length} deals saved · showing 3 most recent`}
              </p>
            </div>
            <Link href="/deals" data-testid="link-see-all-deals">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-accent transition-colors"
              >
                See all <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[...deals]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 3)
              .map((d) => (
                <SavedDealRow
                  key={d.id}
                  deal={d}
                  onOpen={() => navigate(`/result/${d.id}`)}
                  onDelete={() => deleteDeal.mutate(d.id)}
                />
              ))}
          </div>
        </section>
      )}

      {deals.length === 0 && (
        <section className="text-center text-sm text-muted-foreground">
          <p>
            Tip: Quick mode is great for first-pass screening. Detailed mode is
            built for serious underwriting.
          </p>
        </section>
      )}
    </div>
  );
}

function SavedDealRow({
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
      className="group cursor-pointer hover-elevate"
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
              <span className="text-xs text-muted-foreground">Est. profit</span>
              <span
                className={`text-base font-semibold tabular-nums ${
                  profitable
                    ? "text-[hsl(var(--success))]"
                    : "text-destructive"
                }`}
              >
                {fmtUSD(r.netProfit)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">ROI on cash</span>
              <span className="text-xs font-medium tabular-nums">
                {fmtPct(r.roiOnCash)}
              </span>
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-card-border">
            <div className="text-xs text-muted-foreground">No numbers yet</div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {new Date(deal.updatedAt).toLocaleDateString()}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            Open <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
