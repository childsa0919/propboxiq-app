// Normalization + comparison helpers for property attributes used by the comp
// hero badges (house style, HVAC, pool, well/septic). Shared so the server
// (enrichment) and client (badge coloring) normalize identically.

const clean = (s: unknown): string =>
  String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");

// --- House style ------------------------------------------------------------
// Collapse RentCast's architectureType strings into a small stable vocabulary.
export function normalizeStyle(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  if (s.includes("colonial")) return "colonial";
  if (s.includes("rambler") || s.includes("ranch")) return "rancher";
  if (s.includes("cape")) return "cape cod";
  if (s.includes("split")) return "split level";
  if (s.includes("town")) return "townhouse";
  if (s.includes("contemporary") || s.includes("modern")) return "contemporary";
  if (s.includes("traditional")) return "traditional";
  if (s.includes("victorian")) return "victorian";
  if (s.includes("craftsman")) return "craftsman";
  if (s.includes("bungalow")) return "bungalow";
  if (s.includes("tudor")) return "tudor";
  return s;
}

// --- Heating / cooling ------------------------------------------------------
export function normalizeHeating(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  if (s.includes("forced")) return "forced air / gas";
  if (s.includes("heat pump")) return "heat pump";
  if (s.includes("radiant")) return "radiant";
  if (s.includes("baseboard")) return "baseboard";
  if (s.includes("electric")) return "electric";
  if (s.includes("gas")) return "gas";
  if (s.includes("oil")) return "oil";
  return s;
}

export function normalizeCooling(raw: unknown): string | null {
  const s = clean(raw);
  if (!s) return null;
  if (s.includes("central")) return "central";
  if (s.includes("heat pump")) return "heat pump";
  if (s.includes("evaporative")) return "evaporative";
  if (s.includes("window") || s.includes("wall")) return "window/wall";
  if (s.includes("none") || s === "no") return "none";
  return s;
}

// Loose style match — "colonial" matches "colonial revival", etc. Both sides are
// normalized first; a match requires one to be a substring of the other.
export function stylesMatch(a: string | null, b: string | null): boolean {
  const na = normalizeStyle(a);
  const nb = normalizeStyle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// --- Location: city + ZIP (v1.7.2 tiered comp ranking) ----------------------
// City normalization: lowercase, trim, collapse whitespace, drop periods so
// "St. Michaels" and "St Michaels" compare equal.
export function normalizeCity(raw: unknown): string | null {
  const s = clean(raw).replace(/\./g, "").trim();
  return s || null;
}

// ZIP normalization: keep the 5-digit base, strip any ZIP+4 suffix.
export function normalizeZip(raw: unknown): string | null {
  const digits = String(raw ?? "").trim().match(/^(\d{5})/);
  return digits ? digits[1] : null;
}

// Case-insensitive exact city match. Null on either side → no match.
export function citiesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeCity(a);
  const nb = normalizeCity(b);
  return na != null && nb != null && na === nb;
}

// 5-digit ZIP match. Null on either side → no match.
export function zipsMatch(a: unknown, b: unknown): boolean {
  const na = normalizeZip(a);
  const nb = normalizeZip(b);
  return na != null && nb != null && na === nb;
}

// Assign a comp to one of six priority tiers (1 = best). City always wins the
// label: a same-city comp is Tier 1/2 even if it also shares the ZIP. Style is
// the secondary axis within each location band.
export function compTier(
  sameCity: boolean,
  sameZip: boolean,
  styleMatch: boolean,
): 1 | 2 | 3 | 4 | 5 | 6 {
  if (sameCity) return styleMatch ? 1 : 2;
  if (sameZip) return styleMatch ? 3 : 4;
  return styleMatch ? 5 : 6;
}

// Location label for the per-comp tier pill: SAME CITY / SAME ZIP / REGIONAL.
export function tierLocationLabel(tier: number): "SAME CITY" | "SAME ZIP" | "REGIONAL" {
  if (tier <= 2) return "SAME CITY";
  if (tier <= 4) return "SAME ZIP";
  return "REGIONAL";
}

// --- Combined HVAC label ----------------------------------------------------
// One compact "heat / cool" style label for the comp hero HVAC badge. Returns
// null only when BOTH sides are unknown.
export function combinedHvacLabel(
  heating: string | null | undefined,
  cooling: string | null | undefined,
): string | null {
  const h = normalizeHeating(heating ?? null);
  const c = normalizeCooling(cooling ?? null);
  if (!h && !c) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (h && c) return `${cap(h)} / ${cap(c)}`;
  return cap((h || c) as string);
}

// Loose heating OR cooling match — either component matching (substring, both
// ways) counts as an HVAC match. Both unknown → not a match (caller renders gray).
export function hvacMatch(
  aHeat: string | null | undefined,
  aCool: string | null | undefined,
  bHeat: string | null | undefined,
  bCool: string | null | undefined,
): boolean {
  const loose = (x: string | null, y: string | null): boolean => {
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  };
  const heatMatch = loose(normalizeHeating(aHeat ?? null), normalizeHeating(bHeat ?? null));
  const coolMatch = loose(normalizeCooling(aCool ?? null), normalizeCooling(bCool ?? null));
  return heatMatch || coolMatch;
}
