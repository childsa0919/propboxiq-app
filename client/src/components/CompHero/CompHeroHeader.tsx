// Header bar: hex "H" mark (reuses the locked PropBoxIQ Logo component) +
// "COMP HERO" gold wordmark + three-dot menu (Export PDF / Filters / Back to deal).

import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Download, Settings2, ArrowLeft } from "lucide-react";
import { COMP_HERO_COLORS } from "./palette";

export function CompHeroHeader({
  dealId,
  onExportPdf,
  onOpenFilters,
}: {
  dealId: number;
  onExportPdf: () => void;
  onOpenFilters: () => void;
}) {
  const [, navigate] = useLocation();

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md"
      style={{
        backgroundColor: "rgba(10,14,18,0.92)",
        borderColor: "rgba(230,238,242,0.10)",
        paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
      }}
      data-testid="comp-hero-header"
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate(`/deal/${dealId}`)}
          className="mr-1 rounded-full p-1.5 hover:bg-white/5"
          aria-label="Back to deal"
          data-testid="button-back-to-deal"
        >
          <ArrowLeft className="h-4 w-4" style={{ color: COMP_HERO_COLORS.cyan }} />
        </button>
        <Logo size={28} variant="full" />
        <span
          className="text-sm font-extrabold uppercase tracking-[0.18em]"
          style={{ color: COMP_HERO_COLORS.gold }}
        >
          Comp Hero
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-full p-2 hover:bg-white/5"
            aria-label="Comp Hero menu"
            data-testid="button-comp-hero-menu"
          >
            <MoreHorizontal className="h-4 w-4" style={{ color: COMP_HERO_COLORS.cyan }} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportPdf} data-testid="menu-comp-hero-export-pdf">
            <Download className="h-4 w-4 mr-2" /> Export PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenFilters} data-testid="menu-comp-hero-filters">
            <Settings2 className="h-4 w-4 mr-2" /> Filters
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
