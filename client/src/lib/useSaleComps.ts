// Fetches sale comps for the Hold result page's BRRRR ARV. Reuses the Flip
// side's `/api/comps` endpoint (the same cascading-radius AVM that powers Flip's
// ARV) and mirrors `useRentComps`' shape: local state + `apiRequest`, not React
// Query. Fires only when an address is present; the server caches the upstream
// AVM 24h so re-runs on the same address cost zero credits.

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export type SaleComp = {
  id: string;
  address: string;
  price: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  distance: number;
  daysOld: number;
  pricePerSqft: number | null;
};

export type SaleCompsResponse = {
  subject: { address: string; sqft: number | null };
  arv: number;
  medianPricePerSqft: number | null;
  compCount: number;
  radiusMiles: number | null;
  comps: SaleComp[];
};

export type UseSaleCompsResult = {
  data: SaleCompsResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function useSaleComps(address: string | null): UseSaleCompsResult {
  const [data, setData] = useState<SaleCompsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiRequest(
          "GET",
          `/api/comps?address=${encodeURIComponent(address)}`,
        );
        const json = (await res.json()) as SaleCompsResponse;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (cancelled) return;
        // A 404 (no comps in area) is an empty state, not an error — the BRRRR
        // card simply falls back to its flat ARV estimate.
        const msg = String((e as { message?: string })?.message ?? "");
        if (msg.startsWith("404")) {
          setData(null);
        } else {
          setError("Couldn't load sale comps");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { data, isLoading, error };
}
