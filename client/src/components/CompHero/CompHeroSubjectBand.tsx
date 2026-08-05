// Subject band: thumbnail + "SUBJECT PROPERTY" cyan label + address +
// sqft/style chip + huge gold Comp Hero ARV. This ARV is computed from the
// user's SELECTED comps only and never overwrites the main deal's ARV.

import { fmtUSD } from "@/lib/calc";
import { COMP_HERO_COLORS } from "./palette";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, Home as HomeIcon } from "lucide-react";

export function CompHeroSubjectBand({
  address,
  sqft,
  style,
  arv,
}: {
  address: string;
  sqft: number | null;
  style: string | null;
  arv: number | null;
}) {
  return (
    <div
      className="rounded-2xl border p-4 sm:p-5"
      style={{ borderColor: "rgba(230,238,242,0.10)", background: "rgba(18,109,133,0.08)" }}
      data-testid="comp-hero-subject-band"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: "rgba(95,212,231,0.12)" }}
        >
          <HomeIcon className="h-6 w-6" style={{ color: COMP_HERO_COLORS.cyan }} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: COMP_HERO_COLORS.cyan }}
          >
            Subject Property
          </p>
          <h1 className="mt-0.5 truncate text-base font-semibold text-foreground sm:text-lg">
            {address}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {sqft != null && (
              <span className="inline-flex h-[22px] items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-medium text-muted-foreground">
                {sqft.toLocaleString()} sqft
              </span>
            )}
            {style && (
              <span className="inline-flex h-[22px] items-center rounded-full border border-white/10 bg-white/5 px-2 text-[10px] font-medium text-muted-foreground">
                {style}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Comp Hero ARV
            </p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 cursor-help text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs">
                  This ARV reflects your Comp Hero selection. Main deal ARV uses
                  tier-ranked comps.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p
            className="mt-0.5 text-3xl font-extrabold tabular-nums sm:text-4xl"
            style={{ color: COMP_HERO_COLORS.gold }}
            data-testid="text-comp-hero-arv"
          >
            {arv != null ? fmtUSD(arv) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
