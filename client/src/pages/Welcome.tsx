import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { defaultDealInputs, type Deal } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "@/lib/calc";
import {
  Zap,
  SlidersHorizontal,
  ArrowRight,
  MapPin,
  Trash2,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

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
    <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20">
      {/* Aerial neighborhood backdrop — desaturated, low opacity, faded to background
          at the bottom so the saved-deals section reads on plain canvas. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] sm:h-[760px] overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.18] saturate-[0.65]"
          style={{ backgroundImage: "url('/welcome-aerial.jpg')" }}
        />
        {/* Coastal teal wash that makes it feel branded, not stock */}
        <div className="absolute inset-0 bg-[hsl(192_76%_30%_/_0.05)]" />
        {/* Fade to white at the bottom so content below sits on clean canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
      </div>

      {/* Hero */}
      <section className="relative text-center mb-10 sm:mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-6">
          <Sparkles className="h-3 w-3 text-accent" />
          Smart flip analysis for everyone
        </div>
        <h1 className="font-display text-[2.5rem] sm:text-[4rem] font-semibold tracking-[-0.04em] mb-4 leading-[0.95]">
          Don’t guess<br />
          <span className="text-accent">your next flip.</span>
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
          Four questions. Instant profit estimate.
        </p>
      </section>

      {/* Primary action: Quick — ultra-modern dark teal card with diagonal sheen,
          hairline grid, and a prominent floating Start chip. Lifts on hover. */}
      <section className="relative mb-6">
        <Link href="/quick" data-testid="link-mode-quick">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            whileHover={{ y: -3 }}
            className="group relative rounded-2xl overflow-hidden cursor-pointer
                       bg-[hsl(200_45%_8%)] border border-white/5
                       shadow-[0_10px_40px_-15px_hsl(192_76%_30%/0.45),0_0_0_1px_hsl(var(--accent)/0.25)]
                       transition-all duration-300
                       hover:shadow-[0_18px_50px_-12px_hsl(192_76%_30%/0.65),0_0_0_1px_hsl(var(--accent)/0.55)]"
          >
            {/* Diagonal aurora sheen — coastal teal → aqua wash on the right side */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  "radial-gradient(120% 100% at 110% 110%, hsl(192 76% 30% / 0.65) 0%, hsl(178 70% 42% / 0.35) 35%, transparent 70%)",
              }}
            />
            {/* Hairline grid texture */}
            <div className="absolute inset-0 grid-overlay opacity-30 pointer-events-none" />
            {/* Animated diagonal sheen on hover */}
            <div
              aria-hidden
              className="absolute -inset-y-8 -left-1/4 w-1/3 -skew-x-12
                         bg-gradient-to-r from-transparent via-white/10 to-transparent
                         translate-x-[-200%] group-hover:translate-x-[400%]
                         transition-transform duration-1000 ease-out"
            />

            <div className="relative p-6 sm:p-9">
              {/* Top label row */}
              <div className="flex items-center justify-between mb-7 sm:mb-9">
                <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))] shadow-[0_0_10px_hsl(var(--accent))]" />
                  Primary action
                </div>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  ~60 seconds
                </div>
              </div>

              {/* Hero icon + title block */}
              <div className="flex items-end justify-between gap-5">
                <div className="flex-1 min-w-0">
                  <div
                    className="inline-flex items-center justify-center h-12 w-12 sm:h-14 sm:w-14 rounded-2xl
                               bg-[hsl(var(--accent))] text-white mb-5
                               shadow-[0_0_30px_hsl(var(--accent)/0.55)]
                               ring-1 ring-white/20"
                  >
                    <Zap className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.2} />
                  </div>
                  <h2 className="font-display text-[1.6rem] sm:text-[2.1rem] font-semibold tracking-[-0.03em] text-white leading-[1.05] mb-1.5">
                    Analyze a flip
                  </h2>
                  <p className="text-sm text-white/65 leading-relaxed max-w-sm">
                    Address, purchase price, rehab budget, ARV. Smart defaults handle the rest.
                  </p>
                </div>

                {/* Floating Start chip — the obvious affordance */}
                <div
                  className="shrink-0 inline-flex items-center gap-2 rounded-full
                             bg-white text-[hsl(200_45%_8%)]
                             pl-4 pr-3 py-2.5 text-sm font-semibold
                             shadow-[0_8px_24px_-6px_rgba(0,0,0,0.4)]
                             group-hover:gap-3 transition-all"
                >
                  Start
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[hsl(var(--accent))] text-white">
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </Link>
      </section>

      {/* Secondary: Detailed mode toggle */}
      <section className="relative mb-14 sm:mb-16 flex justify-center">
        <Link href="/detailed" data-testid="link-mode-detailed">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>
              Need full control over financing, holding, and closing? <span className="text-foreground font-medium underline-offset-4 group-hover:underline">Switch to Detailed</span>
            </span>
          </button>
        </Link>
      </section>

      {/* Saved deals — show top 3 most recent only, link to /deals for full list */}
      {deals.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Your saved deals
              </h2>
              <p className="text-sm text-muted-foreground">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...deals]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 3)
              .map((d) => (
                <DealCard
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

function ModeCard({
  to,
  icon,
  badge,
  title,
  subtitle,
  description,
  accent,
}: {
  to: string;
  icon: React.ReactNode;
  badge?: string;
  title: string;
  subtitle: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link href={to} data-testid={`link-mode-${title.toLowerCase()}`}>
      <Card
        className={`group cursor-pointer h-full transition-all hover-elevate active-elevate-2 ${
          accent
            ? "border-accent/50 shadow-[0_0_0_1px_hsl(var(--accent)/0.15)]"
            : ""
        }`}
      >
        <CardContent className="p-7 sm:p-8 flex flex-col h-full">
          <div className="flex items-start justify-between mb-5">
            <div
              className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                accent
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary text-foreground"
              }`}
            >
              {icon}
            </div>
            {badge && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground bg-accent rounded-full px-2.5 py-1">
                {badge}
              </span>
            )}
          </div>
          <h3 className="text-2xl font-semibold tracking-tight mb-1">
            {title}
          </h3>
          <p className="text-sm font-medium text-foreground mb-3">{subtitle}</p>
          <p className="text-sm text-muted-foreground leading-relaxed flex-1">
            {description}
          </p>
          <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:gap-2.5 transition-all">
            Start
            <ArrowRight className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
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
