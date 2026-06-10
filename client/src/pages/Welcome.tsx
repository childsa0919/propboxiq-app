import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import { ArrowRight, MapPin, Trash2, TrendingUp, Home } from "lucide-react";
import { motion } from "framer-motion";
import { DealCard as PreviewDealCard } from "@/components/DealCard";
import { NewBadge } from "@/components/ui/NewBadge";

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

      {/* Variant B — Flip primary hero + Hold secondary card */}
      <section className="flex flex-col gap-3.5 mb-12">
        {/* Flip = primary hero */}
        <Link href="/quick" data-testid="link-mode-quick">
          <div
            className="relative overflow-hidden rounded-[18px] border border-accent/30 p-[22px]
                       text-white active:scale-[0.99] transition-transform"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-teal) 0%, #1a8aa6 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(95,212,231,0.3) 0%, transparent 70%)",
              }}
            />
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.08em]">
              <TrendingUp className="h-3 w-3" strokeWidth={2.4} />
              QUICK FLIP
            </span>
            <h2 className="font-display text-[22px] font-bold tracking-[-0.02em]">
              Flip
            </h2>
            <p className="mt-1 mb-4 text-[12px] leading-[1.5] text-white/85">
              ARV, profit, MAO, and holding costs in under a minute.
            </p>
            <span className="inline-flex items-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-[13px] font-bold text-primary">
              Analyze a flip
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </span>
          </div>
        </Link>

        {/* Hold = secondary smaller card */}
        <Link href="/hold" data-testid="link-mode-hold">
          <div className="flex items-center gap-3.5 rounded-[14px] border border-card-border bg-card p-3.5 hover-elevate active:scale-[0.99] transition-transform">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
              <Home className="h-4 w-4" strokeWidth={1.9} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[9px] font-bold tracking-[0.14em] text-muted-foreground/70">
                ALSO NEW
              </div>
              <h3 className="flex items-center gap-1.5 text-[14px] font-bold text-foreground">
                Hold <NewBadge />
              </h3>
              <p className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                Cash flow, expenses, and long-term upside.
              </p>
            </div>
            <ArrowRight
              className="h-4 w-4 flex-shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
          </div>
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
