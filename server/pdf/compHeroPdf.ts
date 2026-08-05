// Institutional Comp Hero PDF (v1.7.5, tightened in v1.7.6) — replaces the
// v1.7.4 client-side jsPDF export (client/src/lib/compHeroPdf.ts, now
// removed) with a server-side Puppeteer HTML→PDF render. jsPDF's imperative
// text/rect API could not deliver the typographic precision (small-caps
// letter-spacing, serif display numerals, hairline rules) an institutional
// OM-style export needs — Puppeteer renders real CSS, so we get real design
// instead of an approximation of one.
//
// Palette is intentionally NOT the app's Coastal Teal — see design spec:
// cream paper (#faf8f3) + muted, print-tuned gold (#a68a3f) + charcoal ink.
// The app UI's cyan/teal/bright-gold (client/src/components/CompHero/palette.ts)
// is untouched; this file owns its own print palette.
//
// v1.7.6 changes (in response to "not attractive at all" user feedback on
// v1.7.5's screenshots):
//   - Comp cards are now text-only (no photo/placeholder area at all — the
//     gold house-icon placeholder read as "fake" and cheap; a clean
//     text-only card in the OM style reads more institutional than a
//     placeholder photo ever did). Cards are tighter and denser as a result.
//   - Real static map via Mapbox (server/pdf/staticMap.ts), replacing the
//     previous "SVG sketch map always shown unless a key happened to be
//     set" behavior with an actual geographic render when the key exists.
//   - Adaptive layout gained explicit 5-comp and 6-comp branches so no page
//     is ever left with a lonely orphaned card or a half-empty page 2.
//   - Chart + map row moved up to fill the dead space that used to sit
//     under a 4-comp grid.
//   - KPI row's dashed-underline treatment removed (looked cheap per
//     screenshots) — values are now just serif type under the gold label.

import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { Deal } from "@shared/schema";
import { fmtUSD } from "@/lib/calc";
import type { CompHeroCardData, CompHeroStats } from "@/components/CompHero/types";
import { getInstitutionalFontFaceCss } from "./fonts";
import { getComparableMapImageSrc, type MapPoint } from "./staticMap";
import { renderPpsfBarChartSvg, type ChartComp } from "./compHeroChart";

const PAPER = "#faf8f3";
const GOLD = "#a68a3f";
const CHARCOAL = "#1a1a1a";
const GRAY = "#666666";

export interface CompHeroPdfComp extends CompHeroCardData {
  lat?: number | null;
  lon?: number | null;
}

export interface CompHeroPdfInput {
  deal: Deal;
  subjectAddress: string;
  subjectSqft: number | null;
  subjectStyle: string | null;
  subjectLat?: number | null;
  subjectLon?: number | null;
  arv: number | null;
  arvLow: number | null;
  arvHigh: number | null;
  stats: CompHeroStats;
  selectedComps: CompHeroPdfComp[];
}

const MAX_COMPS = 8;

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Text-only comp card (v1.7.6 — the photo/placeholder area was removed
// entirely; see file header). Micro gold label, serif address, gray meta
// line, then the price in gold serif with a $/SF subtitle.
function compCard(comp: CompHeroPdfComp, index: number): string {
  const bedsBaths =
    comp.beds != null || comp.baths != null
      ? `${comp.sqft ? comp.sqft.toLocaleString() + " SF · " : ""}${comp.beds ?? "—"} BD · ${comp.baths ?? "—"} BA`
      : comp.sqft
        ? `${comp.sqft.toLocaleString()} SF`
        : "";
  return `
    <div class="comp-card">
      <div class="comp-label">COMP ${index + 1}</div>
      <div class="comp-address">${esc(comp.address)}</div>
      <div class="comp-meta">${esc(bedsBaths)}</div>
      <div class="comp-rule"></div>
      <div class="comp-price">${comp.soldPrice != null ? fmtUSD(comp.soldPrice) : "—"}</div>
      <div class="comp-ppsf">${comp.pricePerSqft != null ? `$${comp.pricePerSqft} /SF` : ""}</div>
    </div>
  `;
}

// A comp card spanning both grid columns — used for the odd 5th/7th card so
// a 5-comp or 7-comp set never ends on a lonely single-column orphan.
function compCardWide(comp: CompHeroPdfComp, index: number): string {
  const bedsBaths =
    comp.beds != null || comp.baths != null
      ? `${comp.sqft ? comp.sqft.toLocaleString() + " SF · " : ""}${comp.beds ?? "—"} BD · ${comp.baths ?? "—"} BA`
      : comp.sqft
        ? `${comp.sqft.toLocaleString()} SF`
        : "";
  return `
    <div class="comp-card comp-card-wide">
      <div class="comp-label">COMP ${index + 1}</div>
      <div class="comp-wide-row">
        <div class="comp-address">${esc(comp.address)}</div>
        <div class="comp-meta">${esc(bedsBaths)}</div>
        <div class="comp-wide-price">
          <div class="comp-price">${comp.soldPrice != null ? fmtUSD(comp.soldPrice) : "—"}</div>
          <div class="comp-ppsf">${comp.pricePerSqft != null ? `$${comp.pricePerSqft} /SF` : ""}</div>
        </div>
      </div>
    </div>
  `;
}

function pageHeader(): string {
  return `
    <div class="page-rule-top"></div>
    <div class="header-row">
      <div class="wordmark">PropBoxIQ</div>
      <div class="header-right">SUBJECT PROPERTY ANALYSIS</div>
    </div>
  `;
}

function footer(preparedDate: string, page: number, pageCount: number): string {
  return `
    <div class="footer-rule"></div>
    <div class="footer-row">
      <span>Data via RentCast, MLS, and public records</span>
      <span class="dot">|</span>
      <span>Prepared ${esc(preparedDate)}</span>
      <span class="dot">|</span>
      <span>Page ${page} of ${pageCount}</span>
      <span class="dot">|</span>
      <span>This analysis is an underwriting estimate, not an appraisal.</span>
    </div>
  `;
}

function baseStyles(): string {
  const fontFaceCss = getInstitutionalFontFaceCss();
  return `
    ${fontFaceCss}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: letter; margin: 0; }
    body {
      background: ${PAPER};
      color: ${CHARCOAL};
      font-family: 'Inter', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      width: 612pt;
      height: 792pt;
      background: ${PAPER};
      padding: 28pt 40pt 24pt;
      position: relative;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }

    .page-rule-top { border-top: 0.5pt solid ${GOLD}; margin-bottom: 12pt; }
    .header-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14pt; }
    .wordmark { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 15pt; color: ${CHARCOAL}; }
    .header-right {
      font-family: 'Inter', sans-serif; font-size: 9pt; font-weight: 600; color: ${GRAY};
      text-transform: uppercase; letter-spacing: 0.12em;
    }

    .label-gold {
      font-family: 'Inter', sans-serif; font-size: 10pt; font-weight: 700; color: ${GOLD};
      text-transform: uppercase; letter-spacing: 0.12em;
    }

    .subject-block { display: flex; justify-content: space-between; gap: 24pt; margin-bottom: 10pt; }
    .subject-left { flex: 1.5; }
    .subject-right { flex: 1; text-align: right; }
    .page-title {
      font-family: 'Playfair Display', serif; font-weight: 700; font-size: 24pt; line-height: 1.1;
      margin: 5pt 0 7pt; color: ${CHARCOAL};
    }
    .subject-address { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 12.5pt; color: ${CHARCOAL}; margin-bottom: 3pt; }
    .subject-sub { font-family: 'Inter', sans-serif; font-size: 9pt; color: ${GRAY}; }
    .arv-value { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 28pt; color: ${CHARCOAL}; margin: 5pt 0 3pt; }
    .arv-range { font-family: 'Inter', sans-serif; font-size: 9pt; color: ${GRAY}; }

    .gold-rule { border-top: 0.5pt solid ${GOLD}; margin: 8pt 0; }

    /* KPI row (v1.7.6): dashed-underline treatment removed per feedback —
       just the gold small-caps label above a plain serif value. Vertical
       rule dividers between columns are unchanged (those read fine). */
    .stats-row { display: flex; margin: 9pt 0; }
    .stat-col { flex: 1; padding: 0 14pt; position: relative; }
    .stat-col + .stat-col { border-left: 0.5pt solid ${GOLD}; }
    .stat-label { font-family: 'Inter', sans-serif; font-size: 9.5pt; font-weight: 700; color: ${GOLD}; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4pt; }
    .stat-value { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 20pt; color: ${CHARCOAL}; }

    .section-title {
      font-family: 'Inter', sans-serif; font-size: 10pt; font-weight: 700; color: ${GOLD};
      text-transform: uppercase; letter-spacing: 0.12em; margin: 2pt 0 8pt;
    }

    /* Text-only comp cards (v1.7.6 — photo area removed entirely). Denser
       and shorter than v1.7.5's photo cards, which frees up vertical room
       for the chart+map row to move up and fill the old dead space. */
    .comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-bottom: 8pt; }
    .comp-grid-3col { grid-template-columns: 1fr 1fr 1fr; }
    .comp-card {
      border: 0.5pt solid ${GOLD}; background: ${PAPER};
      padding: 10pt 12pt; display: flex; flex-direction: column; justify-content: center;
      min-height: 58pt;
    }
    .comp-card-wide { grid-column: 1 / -1; padding: 9pt 14pt; min-height: 40pt; }
    .comp-wide-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14pt; }
    .comp-wide-row .comp-address { flex: 1.4; margin-bottom: 0; }
    .comp-wide-row .comp-meta { flex: 1; margin-bottom: 0; }
    .comp-wide-price { flex-shrink: 0; text-align: right; }
    .comp-wide-price .comp-price { margin-bottom: 0; }

    .comp-label { font-family: 'Inter', sans-serif; font-size: 7.5pt; font-weight: 700; color: ${GOLD}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3pt; }
    .comp-address { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 11.5pt; color: ${CHARCOAL}; line-height: 1.15; margin-bottom: 3pt; }
    .comp-meta { font-family: 'Inter', sans-serif; font-size: 8pt; color: ${GRAY}; margin-bottom: 5pt; }
    .comp-rule { border-top: 0.5pt solid ${GOLD}; opacity: 0.5; margin-bottom: 5pt; width: 44%; }
    .comp-price { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 15pt; color: ${GOLD}; }
    .comp-ppsf { font-family: 'Inter', sans-serif; font-size: 8pt; color: ${GRAY}; margin-top: 1pt; }

    .bottom-row { display: flex; gap: 24pt; margin-top: 4pt; }
    .chart-col { flex: 1; }
    .map-col { flex: 1; display: flex; flex-direction: column; align-items: flex-start; }
    .map-frame { border: 0.5pt solid ${GOLD}; }
    .map-frame img { display: block; width: 260pt; height: 175pt; object-fit: cover; }

    /* Page 2 of a 7-8 comp export has only 1-2 leftover comp cards, so the
       leftover card(s) render larger and the whole remaining block
       (leftover cards + chart + map) is vertically centered in the page's
       remaining space instead of leaving a large dead zone pinned to the
       top with empty page below. */
    .page2-grid .comp-card { min-height: 92pt; padding: 16pt 20pt; }
    .page2-grid .comp-card .comp-address { font-size: 14pt; }
    .page2-grid .comp-card .comp-price { font-size: 19pt; }
    .page2-grid .comp-card-wide { min-height: 64pt; }
    .page2-body {
      display: flex; flex-direction: column; justify-content: center;
      min-height: 560pt;
    }
    .page1-grid-center {
      display: flex; flex-direction: column; justify-content: center;
      min-height: 430pt;
    }
    .page1-grid-center .comp-card { min-height: 78pt; padding: 13pt 16pt; }
    .bottom-row-expanded { margin-top: 36pt; }
    .bottom-row-expanded .map-frame img { width: 260pt; height: 175pt; }
    .bottom-row-expanded .chart-col img { width: 260pt; height: 175pt; }

    .footer-rule { border-top: 0.5pt solid ${GOLD}; position: absolute; left: 40pt; right: 40pt; bottom: 40pt; }
    .footer-row {
      position: absolute; left: 40pt; right: 40pt; bottom: 22pt;
      display: flex; gap: 6pt; font-family: 'Inter', sans-serif; font-size: 8pt; color: ${GRAY};
    }
    .footer-row .dot { color: ${GOLD}; }
  `;
}

function bottomRow(chartImgTag: string, mapSrc: string, expanded = false): string {
  return `
    <div class="bottom-row${expanded ? " bottom-row-expanded" : ""}">
      <div class="chart-col">
        <div class="section-title">$/SQFT Comparables</div>
        ${chartImgTag}
      </div>
      <div class="map-col">
        <div class="section-title">Comparable Location Map</div>
        <div class="map-frame"><img src="${mapSrc}" width="260" height="175" /></div>
      </div>
    </div>
  `;
}

// Adaptive length plan (v1.7.6 — explicit branches for every comp count so
// no page is ever left orphaned or half-empty):
//   1-4 comps: 1 page.  2x2 grid.                       chart+map below.
//   5 comps:   1 page.  2x2 grid + 1 wide row (comp 5).  chart+map below.
//   6 comps:   1 page.  3x2 grid.                       chart+map below.
//   7-8 comps: 2 pages. Page 1: first 6 in 3x2.
//                       Page 2: remaining (1-2, wide row if just 1) + chart+map.
interface LayoutPlan {
  pageCount: 1 | 2;
  page1Comps: CompHeroPdfComp[];
  page1WideComp: CompHeroPdfComp | null; // 5-comp case only
  page1Grid3Col: boolean; // 6-comp and 7-8-comp page 1 case
  page2Comps: CompHeroPdfComp[];
  page2WideComp: CompHeroPdfComp | null; // 7-comp page-2 case (1 leftover)
  page1HasBottomRow: boolean;
}

function planLayout(comps: CompHeroPdfComp[]): LayoutPlan {
  const n = comps.length;

  if (n <= 4) {
    return {
      pageCount: 1,
      page1Comps: comps,
      page1WideComp: null,
      page1Grid3Col: false,
      page2Comps: [],
      page2WideComp: null,
      page1HasBottomRow: true,
    };
  }

  if (n === 5) {
    return {
      pageCount: 1,
      page1Comps: comps.slice(0, 4),
      page1WideComp: comps[4],
      page1Grid3Col: false,
      page2Comps: [],
      page2WideComp: null,
      page1HasBottomRow: true,
    };
  }

  if (n === 6) {
    return {
      pageCount: 1,
      page1Comps: comps,
      page1WideComp: null,
      page1Grid3Col: true,
      page2Comps: [],
      page2WideComp: null,
      page1HasBottomRow: true,
    };
  }

  // 7 or 8 comps: page 1 gets the first 6 (3x2), page 2 gets the rest.
  const rest = comps.slice(6);
  const page2WideComp = rest.length === 1 ? rest[0] : null;
  const page2Comps = page2WideComp ? [] : rest;

  return {
    pageCount: 2,
    page1Comps: comps.slice(0, 6),
    page1WideComp: null,
    page1Grid3Col: true,
    page2Comps,
    page2WideComp,
    page1HasBottomRow: false,
  };
}

interface AssembledHtml {
  html: string;
  filename: string;
}

async function assembleHtml(
  input: CompHeroPdfInput,
  chartImgTag: string,
  mapSrc: string,
): Promise<AssembledHtml> {
  const { deal, subjectAddress, subjectSqft, subjectStyle, arv, arvLow, arvHigh, stats, selectedComps } =
    input;

  const preparedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const preparedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const preparedDateTime = `${preparedDate} at ${preparedTime}`;

  const subjectSub = [subjectSqft ? `${subjectSqft.toLocaleString()} SF` : null, subjectStyle]
    .filter(Boolean)
    .join(" · ");

  const comps = selectedComps.slice(0, MAX_COMPS);
  const plan = planLayout(comps);

  const subjectStatsRow = `
    <div class="stats-row">
      <div class="stat-col"><div class="stat-label">$/SQFT</div><div class="stat-value">${stats.avgPpsf != null ? `$${stats.avgPpsf}` : "—"}</div></div>
      <div class="stat-col"><div class="stat-label">Low</div><div class="stat-value">${stats.lowPpsf != null ? `$${stats.lowPpsf}` : "—"}</div></div>
      <div class="stat-col"><div class="stat-label">High</div><div class="stat-value">${stats.highPpsf != null ? `$${stats.highPpsf}` : "—"}</div></div>
      <div class="stat-col"><div class="stat-label">Comps</div><div class="stat-value">${stats.selectedCount}</div></div>
    </div>
  `;

  const subjectBlock = `
    <div class="subject-block">
      <div class="subject-left">
        <div class="label-gold">Subject Property</div>
        <div class="page-title">Comparable Sales Analysis</div>
        <div class="subject-address">${esc(subjectAddress || "—")}</div>
        <div class="subject-sub">${esc(subjectSub)}</div>
      </div>
      <div class="subject-right">
        <div class="label-gold">After Repair Value</div>
        <div class="arv-value">${arv != null ? fmtUSD(arv) : "—"}</div>
        ${
          arvLow != null && arvHigh != null
            ? `<div class="arv-range">Range ${fmtUSD(arvLow)} - ${fmtUSD(arvHigh)}</div>`
            : ""
        }
      </div>
    </div>
  `;

  const page1GridClass = plan.page1Grid3Col ? "comp-grid comp-grid-3col" : "comp-grid";
  const page1CardsHtml =
    plan.page1Comps.map((c, i) => compCard(c, i)).join("") +
    (plan.page1WideComp ? compCardWide(plan.page1WideComp, plan.page1Comps.length) : "");

  // The 7-8 comp case's page 1 (6 comps, no chart/map — those move to page
  // 2) has noticeably less content than the other cases, so its comp grid
  // is wrapped in the same vertical-centering treatment as page 2 gets,
  // rather than pinning the grid to the top and leaving dead space below.
  const page1CompsBlock = !plan.page1HasBottomRow
    ? `<div class="page1-grid-center"><div class="section-title">Comparables</div><div class="${page1GridClass}">${page1CardsHtml}</div></div>`
    : `<div class="section-title">Comparables</div><div class="${page1GridClass}">${page1CardsHtml}</div>`;

  const page1 = `
    <div class="page">
      ${pageHeader()}
      ${subjectBlock}
      <div class="gold-rule"></div>
      ${subjectStatsRow}
      <div class="gold-rule"></div>
      ${page1CompsBlock}
      ${plan.page1HasBottomRow ? bottomRow(chartImgTag, mapSrc) : ""}
      ${footer(preparedDateTime, 1, plan.pageCount)}
    </div>
  `;

  const page2Offset = plan.page1Comps.length;
  const page2CardsHtml =
    plan.page2Comps.map((c, i) => compCard(c, i + page2Offset)).join("") +
    (plan.page2WideComp ? compCardWide(plan.page2WideComp, page2Offset) : "");

  const page2 =
    plan.pageCount === 2
      ? `
    <div class="page">
      ${pageHeader()}
      <div class="page2-body">
        <div class="section-title">Comparables (continued)</div>
        <div class="comp-grid page2-grid">${page2CardsHtml}</div>
        <div class="gold-rule"></div>
        ${bottomRow(chartImgTag, mapSrc, true)}
      </div>
      ${footer(preparedDateTime, 2, plan.pageCount)}
    </div>
  `
      : "";

  const safeAddr = (deal.name?.trim() || deal.address || "property")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const ymd = new Date().toISOString().slice(0, 10);
  const filename = `PropBoxIQ_${safeAddr}_CompHero_${ymd}.pdf`;

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>${baseStyles()}</style>
    </head>
    <body>
      ${page1}
      ${page2}
    </body>
  </html>`;

  return { html, filename };
}

export async function renderCompHeroPdfBuffer(
  input: CompHeroPdfInput,
): Promise<{ buffer: Buffer; filename: string }> {
  const comps = input.selectedComps.slice(0, MAX_COMPS);

  const chartComps: ChartComp[] = comps
    .filter((c) => c.pricePerSqft != null)
    .map((c, i) => ({ label: `Comp ${i + 1}`, ppsf: c.pricePerSqft as number }));
  const chartSvg = renderPpsfBarChartSvg(chartComps, input.stats.avgPpsf);
  const chartSvgDataUri = `data:image/svg+xml;base64,${Buffer.from(chartSvg, "utf-8").toString("base64")}`;
  const chartImgTag = `<img src="${chartSvgDataUri}" width="260" height="175" />`;

  const points: MapPoint[] = [];
  if (input.subjectLat != null && input.subjectLon != null) {
    points.push({ lat: input.subjectLat, lon: input.subjectLon, label: "SUBJECT", isSubject: true });
  }
  comps.forEach((c, i) => {
    if (c.lat != null && c.lon != null) {
      points.push({ lat: c.lat, lon: c.lon, label: String(i + 1), isSubject: false });
    }
  });
  const map = await getComparableMapImageSrc(points);

  const { html, filename } = await assembleHtml(input, chartImgTag, map.src);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return { buffer: Buffer.from(pdfBuffer), filename };
  } finally {
    await browser.close();
  }
}

async function launchBrowser(): Promise<Browser> {
  // Local dev / any environment with a system Chromium already installed
  // (e.g. this workspace's `chromium` package) can skip the bundled
  // @sparticuz/chromium binary entirely via PUPPETEER_EXECUTABLE_PATH.
  const overridePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const executablePath = overridePath || (await chromium.executablePath());

  return puppeteer.launch({
    args: overridePath ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: true,
  });
}
