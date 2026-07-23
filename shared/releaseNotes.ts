// Structured source-of-truth for the in-app Release Notes card (Settings).
// Kept in sync with CHANGELOG.md. We ship structured data (rather than importing
// the raw markdown) so rendering needs no markdown dependency and stays typed.

export interface ReleaseNote {
  version: string;
  date: string; // ISO-ish display date
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.6.0",
    date: "2026-07-22",
    added: [
      "What-If sliders: tap the value to type an exact number",
      "Comp hero badges: house style, well/septic, HVAC, pool — green match / red mismatch",
      "MD GIS coverage expanded to Prince George's, Montgomery, Howard, Charles counties",
      "Release Notes card in Settings with \"What's New\" badge",
    ],
    changed: [
      "What-If sliders now step $500 / 0.25% and clamp to ±50% of baseline",
      "Default agent commission → 5%",
      "ARV formula unified: BRRRR now uses the same top-4-by-price × avg $/sqft math as Flip (removed the +5% BRRRR bump)",
      "Comp ranking: when ≥6 comps match subject house style, top-4 of matching style drive ARV",
    ],
    fixed: ["Removed unjustified 1.05 multiplier from BRRRR ARV"],
  },
  {
    version: "1.5.2",
    date: "2026-07-18",
    fixed: ["Status bar / safe-area handling on notched devices"],
  },
  {
    version: "1.5.1",
    date: "2026-07-15",
    added: ["Hold result trio: cash-flow, equity, and BRRRR feasibility cards"],
  },
  {
    version: "1.5.0",
    date: "2026-07-10",
    added: ["Hold analysis v2 — 10-year cash-flow and equity projections"],
  },
  {
    version: "1.4.0",
    date: "2026-07-01",
    added: ["Site Intelligence panel and expanded property profile"],
  },
];
