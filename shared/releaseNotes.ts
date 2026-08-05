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
    version: "1.7.5",
    date: "2026-08-04",
    changed: [
      "Comp Hero PDF export completely redesigned to look institutional (Marcus & Millichap / JLL-style offering memorandum), replacing v1.7.4's minimal solid-teal-band + text-list layout",
      "Export pipeline moved from client-side jsPDF to a server-side Puppeteer HTML-to-PDF render, enabling real CSS typography instead of an imperative-API approximation of it",
      "New palette exclusive to the PDF: cream paper + muted gold + charcoal ink - distinct from the app UI's Coastal Teal, which is unchanged",
      "Typography: Playfair Display (serif, titles/ARV/addresses) + Inter (sans, body/labels), both self-hosted so the PDF never depends on a live font CDN at render time",
    ],
    added: [
      "Comp photo grid: each comp card now shows a photo (real photo for manual comps when available, neutral placeholder otherwise)",
      "$/sqft bar chart with a dashed subject-line overlay and per-bar data labels",
      "Comparable location map (static map API or SVG sketch-map fallback)",
      "Footer with data-source attribution, prepared date, page number, and an appraisal disclaimer",
      "Adaptive pagination: 1 page for 4 or fewer comps, 2 pages for 5-8 comps",
    ],
  },
  {
    version: "1.7.4",
    date: "2026-08-04",
    added: [
      "New Comp Hero view (/deal/:id/comp-hero): a dedicated, shareable, print-ready comparable-property analysis screen",
      "Check/uncheck any of the 8 comps to control which ones drive the Comp Hero ARV — recomputes live, independent of the main deal's ARV",
      "Add manual comps by pasting a plain address or a Zillow/Redfin listing URL; server tries a scrape first, falls back to RentCast enrichment",
      "Export the full Comp Hero view to a print-ready PDF (subject band, KPI row, $/sqft chart, comp grid, stats footer)",
      "'Comp Hero' entry points added: gold-outlined button on the Comps section header and an 'Open Comp Hero' item in the deal actions menu",
      "Selection state and manual comps persist per-deal, so the Comp Hero view is reproducible across visits",
    ],
  },
  {
    version: "1.7.3",
    date: "2026-07-28",
    added: [
      "Sources & Uses card now supports Edit Mode: tap the pencil to make every % and $ editable",
      "Changes recalculate live — bar chart, total project cost, and profit all update as you type",
      "Itemized closing-cost sub-rows are editable too; the parent row re-totals from its items",
      "Save persists changes to the deal; Cancel discards",
      "Warning banner when total costs exceed ARV",
    ],
    changed: [
      "Row percentages in the Sources & Uses card are now a share of ARV (they were a share of total project cost)",
    ],
  },
  {
    version: "1.7.2",
    date: "2026-07-22",
    changed: [
      "Comp ranking now prioritizes SAME CITY, then SAME ZIP, above raw price",
      "ARV selection tier order: same-city+same-style → same-city → same-ZIP+same-style → same-ZIP → regional+same-style → regional",
      "ARV card shows a summary line explaining which tier(s) drove the number",
      "Each comp card shows a location tier badge (SAME CITY / SAME ZIP / REGIONAL)",
    ],
    added: [
      "'Flooring' added to the default Walkthrough Budget line items (Interior Finish category)",
    ],
  },
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
