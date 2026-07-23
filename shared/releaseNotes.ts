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
    version: "1.7.1",
    date: "2026-07-22",
    fixed: [
      "Walkthrough Budget button now available on the Flip and Hold wizard rehab steps (was previously only on the result page)",
      "Walkthrough total flows into the wizard's rehab input, then persists to the deal when saved",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-07-22",
    added: [
      "Refresh Deal: re-run comps, enrichment, and scores on demand — freezes a full point-in-time snapshot",
      "Snapshot History: browse the latest snapshots with ARV / rent deltas per refresh",
      "Compare view: pick any two snapshots and see green/red deltas across Deal Metrics, Comps, Site Intelligence, and Budget",
      "Deal quality trend summary (improved / regressed / unchanged) at a glance",
    ],
    changed: [
      "Deals never auto-refresh on open — every refresh is an explicit, credit-burning action",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-07-22",
    added: [
      "Walkthrough Budget: itemize rehab across 7 categories with 29 default line items",
      "Add custom line items to any category",
      "Save budget per deal, restore on reopen",
      "Export categorized Budget PDF for contractor bidding",
    ],
  },
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
