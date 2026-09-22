# Institutional lender memo

The existing Flip PDF download and email-attachment functions now use a shared print-only renderer. Hold has a matching download button using the effective inputs after operating-expense edits. The approved visual direction is a navy header, teal rules, a score strip, four executive metrics, aligned schedules and a confidentiality footer.

## Scope

- Keep calculation engines, API routes, database schema and production settings unchanged.
- Extract the existing Flip score formula unchanged for reuse in the results page and PDF.
- Match the Flip screen's locale-aware calculation call. The old PDF omitted the locale, so its closing costs could differ from the screen.
- Preserve existing maximum-offer and break-even outputs, explicitly noting their original model conventions.
- Use the existing long-term Hold score as the headline, and show both existing Hold scores on the supporting page.
- Preserve saved comp exclusions; never print raw JSON or invent missing market evidence.
- Keep the separate Comp Hero PDF and comparison PDF unchanged.

## Verification commands

Requires Node dependencies and Poppler's `pdftotext` for text-extraction tests. Poppler is a development verification tool, not a runtime dependency.

```sh
npm run test:memo
npm run check
npm run build
npm run sample:memo -- /tmp/propboxiq-memo-samples
```

The sample command uses synthetic properties only and does not contact external providers.

## QA inventory

- **Flip download:** Click the actual Quick Result download button; verify PDF content and filename.
- **Email compatibility:** Test generated attachment bytes, base64 and filename without sending an email.
- **Hold download:** Click the actual Hold Result button; verify current values and both score labels.
- **Print appearance:** Inspect every page of both generated sample PDFs, including dense comp evidence.
- **Pagination:** Long notes must preserve the last line and repeat page numbers and confidentiality treatment.
- **Financial consistency:** Match locale-aware Flip results, manual financing/holding overrides and effective Hold inputs.
- **Edge cases:** Missing market references, excluded comps, all-cash purchases and negative returns.
- **Unchanged export:** Generate the comparison PDF after renderer replacement.
- **Responsive controls:** Verify download controls at desktop and narrow mobile widths.

## Review boundaries

This change does not send lender emails, approve a loan, fetch new market evidence or alter scoring formulas. It does not add Excel export or change the separate Comp Hero valuation report. Production rollout requires the reviewed feature branch to be merged.

## Executed verification

- Seven automated report tests passed; TypeScript check and production build passed.
- Both actual download buttons were exercised in an isolated application with synthetic data. Downloaded PDFs contained the new lender memo.
- The existing email dialog opened successfully; no email was sent. Attachment byte/base64 consistency is covered by the automated tests.
- Both two-page sample PDFs were visually inspected and passed text-boundary checks.
- The new Hold button and relabeled Flip button were inspected at 390px mobile width; both are visible and usable.
- An existing horizontal overflow in Quick Result's sources-and-uses/map region was observed, outside the modified controls. It is not changed by this print-only task.
- The app uses hash routing (`/#/result/:id` and `/#/hold/result`), which was preserved.
- Build emitted PostCSS and large-chunk warnings; neither was introduced as part of a build-configuration change.

## Approved header refinement

The approved navy header now uses the existing four-tile mark as native PDF outlines, including the original house cutout and muted teal fourth tile. The uppercase tracked wordmark, Real Estate Intelligence descriptor, confidentiality label, and thin teal rule match the approved direction. Strategy and date remain visible. Both strategies and all continuation pages use the same header; no raster mockup is embedded. Tests verify repeated branding, absence of the superseded tagline, and the 40pt text margins including tracked right-aligned labels.
