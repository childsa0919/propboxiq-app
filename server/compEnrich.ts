// Comp enrichment — for each sale comp returned by RentCast's AVM (which carries
// no house-style / HVAC / pool / utility data), make a follow-up RentCast
// /properties lookup plus an MD GIS water/sewer lookup so the client can render
// the comp hero badges (item 6) and rank by style (item 5).
//
// Everything is best-effort and parallel: one failed enrichment (Promise.allSettled
// + an 8s per-call timeout, per the PR #24 pattern) never fails the whole response.
// RentCast /properties is cached 24h in SQLite (rentcast.ts); water/sewer is cached
// 24h in-memory (siteGis.ts).

import { getOrFetch as rcGet } from "./rentcast";
import { fetchWaterSewer, combinedWaterSewerLabel, type WaterSewer } from "./siteGis";
import {
  normalizeStyle,
  normalizeHeating,
  normalizeCooling,
} from "@shared/propAttributes";

const ENRICH_TIMEOUT_MS = 8000;

export interface CompEnrichment {
  style: string | null;
  heatingType: string | null;
  coolingType: string | null;
  hasPool: boolean | null;
  water: WaterSewer["water"];
  sewer: WaterSewer["sewer"];
  waterSewerLabel: string | null;
  hoa: boolean | null; // captured opportunistically; NOT surfaced in the UI
}

export interface EnrichInput {
  address: string | null;
  lat: number | null;
  lon: number | null;
}

const EMPTY: CompEnrichment = {
  style: null,
  heatingType: null,
  coolingType: null,
  hasPool: null,
  water: "unknown",
  sewer: "unknown",
  waterSewerLabel: null,
  hoa: null,
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`enrich timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// Pull the RentCast /properties feature block for an address (first record).
async function fetchFeatures(address: string): Promise<any | null> {
  const data: any = await withTimeout(
    rcGet("properties", { address }),
    ENRICH_TIMEOUT_MS,
  );
  if (!data) return null;
  // /v1/properties returns an array of matching records.
  const rec = Array.isArray(data) ? data[0] : data;
  return rec ?? null;
}

/** Enrich one comp. Never throws — returns EMPTY on any failure. */
export async function enrichComp(input: EnrichInput): Promise<CompEnrichment> {
  const [featR, wsR] = await Promise.allSettled([
    input.address ? fetchFeatures(input.address) : Promise.resolve(null),
    input.lat != null && input.lon != null
      ? withTimeout(fetchWaterSewer(input.lat, input.lon), ENRICH_TIMEOUT_MS)
      : Promise.resolve(null),
  ]);

  const out: CompEnrichment = { ...EMPTY };

  if (featR.status === "fulfilled" && featR.value) {
    const f = featR.value.features ?? {};
    out.style = normalizeStyle(f.architectureType);
    out.heatingType = normalizeHeating(f.heatingType ?? (f.heating ? "yes" : null));
    out.coolingType = normalizeCooling(f.coolingType ?? (f.cooling ? "central" : null));
    out.hasPool = typeof f.pool === "boolean" ? f.pool : null;
    // HOA — RentCast rarely returns it; capture if present but don't surface.
    const hoaRaw = featR.value.hoa ?? f.hoa ?? featR.value.hoaFee ?? null;
    out.hoa = hoaRaw != null ? Boolean(hoaRaw) : null;
  }

  if (wsR.status === "fulfilled" && wsR.value) {
    const ws = wsR.value as WaterSewer;
    // Only trust water/sewer inside the expanded MD GIS coverage.
    if (ws.inScope) {
      out.water = ws.water;
      out.sewer = ws.sewer;
      out.waterSewerLabel = combinedWaterSewerLabel(ws);
    }
  }

  return out;
}

/** Enrich a list of comps in parallel. Order is preserved. */
export async function enrichComps(inputs: EnrichInput[]): Promise<CompEnrichment[]> {
  const settled = await Promise.allSettled(inputs.map((i) => enrichComp(i)));
  return settled.map((r) => (r.status === "fulfilled" ? r.value : { ...EMPTY }));
}
