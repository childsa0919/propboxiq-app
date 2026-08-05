// Comp Hero page (/deal/:id/comp-hero). Fetches the deal, tier-ranked comps
// (/api/comps), and Comp Hero selection state; merges auto + manual comps;
// computes an independent ARV from ONLY the selected comps (never touches the
// main deal's ARV); persists selection with a 300ms debounce.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Deal, ManualComp } from "@shared/schema";
import type { SaleCompsResponse } from "@/lib/useSaleComps";
import { computeArvFromComps } from "@shared/arv";
import { CompHeroHeader } from "./CompHeroHeader";
import { CompHeroSubjectBand } from "./CompHeroSubjectBand";
import { CompHeroKPIRow } from "./CompHeroKPIRow";
import { CompHeroSqftChart } from "./CompHeroSqftChart";
import { CompHeroGrid } from "./CompHeroGrid";
import { CompHeroStatsFooter } from "./CompHeroStatsFooter";
import { CompHeroActionBar } from "./CompHeroActionBar";
import { AddCompModal } from "./AddCompModal";
import {
  autoCompToCardData,
  manualCompToCardData,
  computeStats,
  type AutoComp,
  type CompHeroCardData,
} from "./types";
import { exportCompHeroPdf } from "@/lib/compHeroPdf";
import { API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type CompHeroStateResponse = {
  selectedCompKeys: string[];
  manualComps: ManualComp[];
};

export default function CompHeroPage() {
  const { id } = useParams<{ id: string }>();
  const dealId = Number(id);
  const { toast } = useToast();

  const { data: deal, isLoading: dealLoading } = useQuery<Deal>({
    queryKey: ["/api/deals", dealId],
    enabled: Number.isFinite(dealId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/deals/${dealId}`);
      return res.json();
    },
  });

  const { data: heroState, isLoading: heroLoading } = useQuery<CompHeroStateResponse>({
    queryKey: ["/api/deals", dealId, "comp-hero"],
    enabled: Number.isFinite(dealId),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/deals/${dealId}/comp-hero`);
      return res.json();
    },
  });

  const { data: compsData, isLoading: compsLoading } = useQuery<SaleCompsResponse>({
    queryKey: ["/api/comps", deal?.address, deal?.sqft],
    enabled: !!deal?.address,
    queryFn: async () => {
      const params = new URLSearchParams({ address: deal!.address });
      const res = await apiRequest("GET", `/api/comps?${params.toString()}`);
      return res.json();
    },
  });

  const [selectedKeys, setSelectedKeys] = useState<Set<string> | null>(null);
  const [manualComps, setManualComps] = useState<ManualComp[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const hydratedRef = useRef(false);

  // Hydrate local state from server once both hero state + comps have loaded.
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!heroState || !compsData) return;
    setManualComps(heroState.manualComps);
    if (heroState.selectedCompKeys.length > 0) {
      setSelectedKeys(new Set(heroState.selectedCompKeys));
    } else {
      // First visit: default-select everything (auto comps + any manual comps).
      const allKeys = [
        ...compsData.comps.map((c) => c.id),
        ...heroState.manualComps.map((m) => m.id),
      ];
      setSelectedKeys(new Set(allKeys));
    }
    hydratedRef.current = true;
  }, [heroState, compsData]);

  // Debounced PATCH of selection state (300ms per spec).
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistSelection = (keys: Set<string>) => {
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => {
      apiRequest("PATCH", `/api/deals/${dealId}/comp-hero`, {
        selectedCompKeys: Array.from(keys),
      }).catch(() => {
        toast({ title: "Couldn't save selection", variant: "destructive" });
      });
    }, 300);
  };

  const allCards: CompHeroCardData[] = useMemo(() => {
    const auto = (compsData?.comps ?? []) as AutoComp[];
    const manual = manualComps ?? [];
    return [...auto.map(autoCompToCardData), ...manual.map(manualCompToCardData)];
  }, [compsData, manualComps]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistSelection(next);
      return next;
    });
  };

  const deleteManualComp = async (manualId: string) => {
    try {
      await apiRequest("DELETE", `/api/deals/${dealId}/comp-hero/manual/${manualId}`);
      setManualComps((prev) => (prev ?? []).filter((m) => m.id !== manualId));
      setSelectedKeys((prev) => {
        const next = new Set(prev ?? []);
        next.delete(manualId);
        persistSelection(next);
        return next;
      });
    } catch {
      toast({ title: "Couldn't remove comp", variant: "destructive" });
    }
  };

  const handleAdded = (comp: ManualComp) => {
    setManualComps((prev) => [...(prev ?? []), comp]);
    setSelectedKeys((prev) => {
      const next = new Set(prev ?? []);
      next.add(comp.id);
      persistSelection(next);
      return next;
    });
  };

  const selectedCards = useMemo(
    () => allCards.filter((c) => selectedKeys?.has(c.key)),
    [allCards, selectedKeys],
  );

  const stats = useMemo(() => computeStats(selectedCards), [selectedCards]);

  // Comp Hero's OWN ARV — computed from selected comps only via the unified
  // PR #25 formula. This never writes back to the main deal's ARV/inputs.
  const arvSqft = deal?.sqft ?? compsData?.subject.sqft ?? null;
  const arvResult = useMemo(() => {
    if (selectedCards.length === 0) return null;
    const pool = selectedCards
      .filter((c) => c.soldPrice != null)
      .map((c) => ({ id: c.key, price: c.soldPrice as number, pricePerSqft: c.pricePerSqft }));
    if (pool.length === 0) return null;
    return computeArvFromComps(pool, arvSqft, selectedCards.length);
  }, [selectedCards, arvSqft]);

  const ppsfSeries = useMemo(
    () =>
      selectedCards
        .map((c) => c.pricePerSqft)
        .filter((n): n is number => n != null)
        .sort((a, b) => a - b),
    [selectedCards],
  );

  const subject = compsData?.subject ?? {
    address: deal?.address ?? "",
    sqft: deal?.sqft ?? null,
    style: null,
    heatingType: null,
    coolingType: null,
    hasPool: null,
    water: undefined,
    sewer: undefined,
    waterSewerLabel: null,
  };

  // v1.7.5: the institutional PDF is rendered server-side via Puppeteer
  // (server/pdf/compHeroPdf.ts) so it can use real CSS typography (Playfair
  // Display small caps, hairline gold rules) that jsPDF's imperative API
  // could not deliver. The client's job is now just: hit the endpoint,
  // download the returned application/pdf blob. The old client-side jsPDF
  // path (client/src/lib/compHeroPdf.ts) is kept only as a fallback if the
  // server render fails (e.g. transient Puppeteer/Chromium launch error),
  // so export never fully breaks.
  const handleExportPdf = async () => {
    if (!deal) return;
    setExporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/deals/${dealId}/comp-hero/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `PropBoxIQ_CompHero_${deal.id}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[comp-hero] server PDF export failed, falling back to client render:", e);
      toast({
        title: "Using basic PDF export",
        description: "The institutional export is temporarily unavailable.",
      });
      exportCompHeroPdf({
        deal,
        subjectAddress: deal.address,
        subjectSqft: arvSqft,
        subjectStyle: subject.style ?? null,
        arv: arvResult?.arv ?? null,
        arvLow: arvResult?.arvLow ?? null,
        arvHigh: arvResult?.arvHigh ?? null,
        stats,
        selectedComps: selectedCards,
      });
    } finally {
      setExporting(false);
    }
  };

  const isLoading = dealLoading || heroLoading || compsLoading || selectedKeys == null;

  if (!Number.isFinite(dealId)) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid deal.</div>;
  }

  if (isLoading || !deal) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-32">
      <CompHeroHeader
        dealId={dealId}
        onExportPdf={handleExportPdf}
        onOpenFilters={() => setAddOpen(false)}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <CompHeroSubjectBand
          address={deal.address}
          sqft={arvSqft}
          style={subject.style ?? null}
          arv={arvResult?.arv ?? null}
        />

        <CompHeroKPIRow stats={stats} ppsfSeries={ppsfSeries} />

        {selectedCards.length > 0 && selectedCards.length < 3 && (
          <div
            className="rounded-xl border px-3.5 py-2.5 text-xs"
            style={{
              borderColor: "rgba(245,201,72,0.4)",
              background: "rgba(245,201,72,0.1)",
              color: "#f5c948",
            }}
            data-testid="banner-low-comp-count"
          >
            Fewer than 3 comps may reduce accuracy
          </div>
        )}

        <CompHeroSqftChart comps={selectedCards} anchorPpsf={arvResult?.anchorPpsf ?? null} />

        <CompHeroGrid
          comps={allCards}
          selectedKeys={selectedKeys}
          subject={subject}
          onToggle={toggleKey}
          onDeleteManual={deleteManualComp}
        />

        <CompHeroStatsFooter stats={stats} />
      </div>

      <CompHeroActionBar
        onExportPdf={handleExportPdf}
        onAddComp={() => setAddOpen(true)}
        onFilters={() => setAddOpen(false)}
        exporting={exporting}
      />

      <AddCompModal dealId={dealId} open={addOpen} onOpenChange={setAddOpen} onAdded={handleAdded} />
    </div>
  );
}
