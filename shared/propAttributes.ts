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
