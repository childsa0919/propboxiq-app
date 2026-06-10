// Fetches rental comps for the Hold wizard's monthly-rent step. Mirrors the
// Flip side's `pullComps` pattern in QuickWizard (local state + `apiRequest`,
// not React Query) so the two wizards stay consistent. Fires only when an
// address is present; the server fixes the query at 5 comps / 0.5 mi and caches
// the upstream response 24h, so re-runs are free.

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export type RentComp = {
  id: string;
  address: string;
  rent: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  distance: number;
  daysOld: number;
  lat: number | null;
  lon: number | null;
};

export type RentCompsResponse = {
  median: number | null;
  rentLow: number | null;
  rentHigh: number | null;
  compCount: number;
  radiusMiles: number;
  comps: RentComp[];
};

export type UseRentCompsResult = {
  data: RentCompsResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

// Pull the friendly message out of apiRequest's `${status}: ${body}` error
// string. When the body is a data_provider_* envelope, surface a soft note.
function parseRentCompsError(e: unknown): string {
  const fallback = "Couldn't load rent comps";
  const m = String((e as { message?: string })?.message ?? "");
  const colonIdx = m.indexOf(":");
  const body = colonIdx >= 0 ? m.slice(colonIdx + 1).trim() : m;
  if (body.startsWith("{")) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.error === "string" && parsed.error.startsWith("data_provider_")) {
        return "Rent comps temporarily unavailable";
      }
    } catch {
      /* fall through */
    }
  }
  return fallback;
}

export function useRentComps(address: string | null): UseRentCompsResult {
  const [data, setData] = useState<RentCompsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

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
          `/api/rent-comps?address=${encodeURIComponent(address)}`,
        );
        const json = (await res.json()) as RentCompsResponse;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (cancelled) return;
        // A 404 (no comps in area) is an empty state, not an error.
        const msg = String((e as { message?: string })?.message ?? "");
        if (msg.startsWith("404")) {
          setData({
            median: null,
            rentLow: null,
            rentHigh: null,
            compCount: 0,
            radiusMiles: 0.5,
            comps: [],
          });
        } else {
          setError(parseRentCompsError(e));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, nonce]);

  return { data, isLoading, error, refetch };
}
