# Changelog

All notable changes to PropBoxIQ are documented here. This project follows
[semantic versioning](https://semver.org/).

## [1.7.4] — 2026-08-04
### Added
- New Comp Hero view (`/deal/:id/comp-hero`): a dedicated, shareable, print-ready comparable-property analysis screen
- Check/uncheck any of the 8 comps to control which ones drive the Comp Hero ARV — recomputes live, independent of the main deal's ARV
- Add manual comps by pasting a plain address or a Zillow/Redfin listing URL; server tries a scrape first, falls back to RentCast enrichment
- Export the full Comp Hero view to a print-ready PDF (subject band, KPI row, $/sqft chart, comp grid, stats footer)
- "Comp Hero" entry points added: gold-outlined button on the Comps section header and an "Open Comp Hero" item in the deal actions menu
- Selection state and manual comps persist per-deal, so the Comp Hero view is reproducible across visits

## [1.7.3] — 2026-07-28
### Added
- Sources & Uses card now supports Edit Mode: tap the pencil to make every % and $ editable
- Changes recalculate live — bar chart, total project cost, and profit all update as you type
- Itemized closing-cost sub-rows are editable too; the parent row re-totals from its items
- Save persists changes to the deal; Cancel discards
- Warning banner when total costs exceed ARV

### Changed
- Row percentages in the Sources & Uses card are now a share of ARV (they were a share of total project cost), matching the card's `Project cost → ARV` bar

## [1.7.2] — 2026-07-22
### Changed
- Comp ranking now prioritizes SAME CITY, then SAME ZIP, above raw price
- ARV selection tier order: same-city+same-style → same-city → same-ZIP+same-style → same-ZIP → regional+same-style → regional
- ARV card shows a summary line explaining which tier(s) drove the number
- Each comp card shows a location tier badge (SAME CITY / SAME ZIP / REGIONAL)

### Added
- 'Flooring' added to the default Walkthrough Budget line items (Interior Finish category)

## [1.7.1] — 2026-07-22
### Fixed
- Walkthrough Budget button now available on the Flip and Hold wizard rehab steps (was previously only on the result page)
- Walkthrough total flows into the wizard's rehab input, then persists to the deal when saved

## [1.7.0] — 2026-07-22
### Added
- Refresh Deal: re-run comps, subject enrichment, rent AVM, site intelligence, and Flip/Hold/BRRRR scores on demand, freezing a full point-in-time snapshot
- Snapshot History card: latest snapshots with per-refresh ARV / rent deltas; the original snapshot is backfilled from stored state on first view
- Compare view (`/deal/:id/compare`): pick any two snapshots and see green/red deltas across Deal Metrics, Comps, Site Intelligence, and Budget, plus an improved/regressed/unchanged trend summary
- Metric hero delta pill showing projected-profit change vs. the last snapshot

### Changed
- Deals never auto-refresh on open — every refresh is an explicit action that burns fresh comp data
- Snapshots are capped at 20 per deal; the oldest non-original snapshot is auto-pruned and the original is never deleted

## [1.6.1] — 2026-07-22
### Added
- Walkthrough Budget: itemize rehab across 7 categories with 29 default line items
- Add custom line items to any category
- Save budget per deal, restore on reopen
- Export categorized Budget PDF for contractor bidding

## [1.6.0] — 2026-07-22
### Added
- What-If sliders: tap the value to type an exact number
- Comp hero badges: house style, well/septic, HVAC, pool — green match / red mismatch
- MD GIS coverage expanded to Prince George's, Montgomery, Howard, Charles counties
- Release Notes card in Settings with "What's New" badge

### Changed
- What-If sliders now step $500 / 0.25% and clamp to ±50% of baseline
- Default agent commission → 5%
- ARV formula unified: BRRRR now uses the same top-4-by-price × avg $/sqft math as Flip (removed the +5% BRRRR bump)
- Comp ranking: when ≥6 comps match subject house style, top-4 of matching style drive ARV

### Fixed
- Removed unjustified 1.05 multiplier from BRRRR ARV

## [1.5.2] — 2026-07-18
### Fixed
- Status bar / safe-area handling on notched devices

## [1.5.1] — 2026-07-15
### Added
- Hold result trio: cash-flow, equity, and BRRRR feasibility cards

## [1.5.0] — 2026-07-10
### Added
- Hold analysis v2 — 10-year cash-flow and equity projections

## [1.4.0] — 2026-07-01
### Added
- Site Intelligence panel and expanded property profile
