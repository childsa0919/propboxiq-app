// Maryland GIS point-in-polygon lookups for water/sewer (well vs. public).
//
// Extracted so both /api/site-intelligence (subject) and /api/comps (comp
// enrichment) share one implementation. Water = EPA national PWS boundaries
// (filtered to MD primacy); Sewer = MDP Generalized Sewer (layer 2, statewide).
// Results are cached in-memory for 24h keyed by rounded lat/lon to avoid hammering
// the flaky MD state hosts on repeat lookups.

// MD JURSCODE (MDP 4-letter county codes) that we treat as "in coverage" for the
// combined well/septic determination. v1.6.0 expands from AACO + Calvert to also
// cover Prince George's, Montgomery, Howard, and Charles counties.
export const MD_GIS_SCOPE: Record<string, string> = {
  ANNE: "Anne Arundel",
  CALV: "Calvert",
  PRIN: "Prince George's",
  MONT: "Montgomery",
  HOWA: "Howard",
  CHAR: "Charles",
};

export interface WaterSewer {
  water: "public" | "well" | "unknown";
  sewer: "public" | "septic" | "unknown";
  waterLabel: string;
  sewerLabel: string;
  jurs: string | null;
  county: string | null;
  inScope: boolean;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "FlipAnalyzer/1.0 (real estate deal analyzer)",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`Upstream timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// --- 24h in-memory cache ----------------------------------------------------
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: WaterSewer }>();

function cacheKey(lat: number, lon: number): string {
  // ~11m precision — enough to dedupe repeat comp lookups without losing accuracy.
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Water + sewer service determination for a point. Never throws — a failed or
 * timed-out source degrades to "unknown" for that field so callers can render a
 * gray badge instead of failing the whole response.
 */
export async function fetchWaterSewer(lat: number, lon: number): Promise<WaterSewer> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      water: "unknown",
      sewer: "unknown",
      waterLabel: "Unknown",
      sewerLabel: "Unknown",
      jurs: null,
      county: null,
      inScope: false,
    };
  }

  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const geom = encodeURIComponent(
    JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
  );
  const common = `geometry=${geom}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json`;

  const waterUrl =
    `https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0/query?` +
    `outFields=PWSID,PWS_Name,Primacy_Agency&where=${encodeURIComponent("Primacy_Agency='MD'")}&${common}`;
  const sewerUrl =
    `https://mdpgis.mdp.state.md.us/arcgis/rest/services/UtilitiesCommunication/Generalized_Sewer/MapServer/2/query?` +
    `outFields=JURSCODE,SERVCAT,GENZ_SWR,SEWSTAT&${common}`;

  const [waterR, sewerR] = await Promise.allSettled([
    fetchJson(waterUrl),
    fetchJson(sewerUrl),
  ]);

  let water: WaterSewer["water"] = "unknown";
  let waterLabel = "Unknown";
  if (waterR.status === "fulfilled" && !waterR.value?.error) {
    const feats = waterR.value?.features ?? [];
    if (feats.length > 0) {
      water = "public";
      waterLabel = (feats[0].attributes?.PWS_Name as string) || "Public water";
    } else {
      water = "well";
      waterLabel = "Well";
    }
  }

  let sewer: WaterSewer["sewer"] = "unknown";
  let sewerLabel = "Unknown";
  let jurs: string | null = null;
  if (sewerR.status === "fulfilled" && !sewerR.value?.error) {
    const feats = sewerR.value?.features ?? [];
    if (feats.length > 0) {
      const a = feats[0].attributes ?? {};
      jurs = (a.JURSCODE as string) || null;
      const code = String(a.GENZ_SWR ?? "").toUpperCase();
      // EXIS = existing public sewer; NOP / empty = no planned service → septic.
      if (code === "NOP" || code === "") {
        sewer = "septic";
        sewerLabel = "Septic";
      } else {
        sewer = "public";
        sewerLabel = "Public sewer";
      }
    } else {
      sewer = "septic";
      sewerLabel = "Septic";
    }
  }

  const county = jurs ? MD_GIS_SCOPE[jurs] ?? null : null;
  const inScope = jurs != null && jurs in MD_GIS_SCOPE;

  const value: WaterSewer = {
    water,
    sewer,
    waterLabel,
    sewerLabel,
    jurs,
    county,
    inScope,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Combined "Well & Septic" / "Public Water & Sewer" style label for a badge. */
export function combinedWaterSewerLabel(ws: {
  water: "public" | "well" | "unknown";
  sewer: "public" | "septic" | "unknown";
}): string | null {
  if (ws.water === "unknown" && ws.sewer === "unknown") return null;
  const w =
    ws.water === "public" ? "Public Water" : ws.water === "well" ? "Well" : null;
  const s =
    ws.sewer === "public" ? "Public Sewer" : ws.sewer === "septic" ? "Septic" : null;
  if (w && s) {
    if (w === "Public Water" && s === "Public Sewer") return "Public Water & Sewer";
    if (w === "Well" && s === "Septic") return "Well & Septic";
    return `${w} + ${s}`;
  }
  return w || s;
}
