// Fetches the area rent-market trend for the Hold result page's 12-mo rent
// chart. Mirrors `useRentComps` (local state + `apiRequest`, not React Query) so
// the Hold data hooks stay consistent. Fires only when a 5-digit ZIP is present;
// the server caches the upstream /markets response 24h, so re-runs are free.

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export type RentMarketPoint = { month: string; median: number };

export type RentMarketResponse =
  | { available: false }
  | {
      available: true;
      zip: string;
      propertyType: string;
      currentMedian: number;
      yoyChange: number;
      history: RentMarketPoint[];
    };

export type RentPropertyType = "single-family" | "multi-family" | "condo";

export type UseRentMarketResult = {
  data: RentMarketResponse | null;
  isLoading: boolean;
  error: string | null;
};

export function useRentMarket(
  zip: string | null,
  propertyType: RentPropertyType = "single-family",
): UseRentMarketResult {
  const [data, setData] = useState<RentMarketResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!zip || !/^\d{5}$/.test(zip)) {
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
          `/api/rent-market?zip=${encodeURIComponent(zip)}&propertyType=${propertyType}`,
        );
        const json = (await res.json()) as RentMarketResponse;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (cancelled) return;
        // A 404 / no-data case is surfaced as an unavailable empty state.
        const msg = String((e as { message?: string })?.message ?? "");
        if (msg.startsWith("404")) {
          setData({ available: false });
        } else {
          setError("Couldn't load rent trend");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zip, propertyType]);

  return { data, isLoading, error };
}
