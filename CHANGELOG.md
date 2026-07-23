# Changelog

All notable changes to PropBoxIQ are documented here. This project follows
[semantic versioning](https://semver.org/).

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
