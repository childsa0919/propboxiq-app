// Institutional Comp Hero PDF (v1.7.5) — replaces the v1.7.4 client-side
// jsPDF export (client/src/lib/compHeroPdf.ts, now removed) with a
// server-side Puppeteer HTML→PDF render. jsPDF's imperative text/rect API
// could not deliver the typographic precision (small-caps letter-spacing,
// serif display numerals, hairline rules) an institutional OM-style export
// needs — Puppeteer renders real CSS, so we get real design instead of an
// approximation of one.
//
// Palette is intentionally NOT the app's Coastal Teal — see design spec:
// cream paper (#faf8f3) + muted, print-tuned gold (#a68a3f) + charcoal ink.
// The app UI's cyan/teal/bright-gold (client/src/components/CompHero/palette.ts)
// is untouched; this file owns its own print palette.

import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { Deal } from "@shared/schema";
import { fmtUSD } from "@/lib/calc";
import type { CompHeroCardData, CompHeroStats } from "@/components/CompHero/types";
import { getInstitutionalFontFaceCss } from "./fonts";
import { getComparableMapImageSrc, type MapPoint } from "./compHeroMap";
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

const COMPS_PER_PAGE = 4;

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Neutral cream placeholder with a tiny gold house glyph, used whenever a
// comp has no photoUrl (always true for RentCast auto comps today — the
// /api/comps AVM endpoint returns no image field; only manual comps scraped
// from a Zillow/Redfin URL may carry a real photoUrl).
function placeholderPhotoDataUri(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90" viewBox="0 0 90 90">
    <rect width="90" height="90" fill="#f2eee1" />
    <rect x="1" y="1" width="88" height="88" fill="none" stroke="${GOLD}" stroke-width="1" />
    <path d="M45 27 L66 43 V63 H24 V43 Z" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linejoin="round" />
    <rect x="40" y="50" width="10" height="13" fill="none" stroke="${GOLD}" stroke-width="1.4" />
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

// Fetches a comp photo URL (only ever set for manual comps scraped from a
// Zillow/Redfin listing page — see server/compHeroManual.ts) and inlines it
// as a base64 data: URI so Puppeteer's offline page.setContent() render
// never depends on a live network fetch at PDF-render time. Falls back to
// null (which compCard() turns into the gold house-icon placeholder) on ANY
// failure: network error, timeout, non-2xx, or a non-image content-type —
// scraped hotlink URLs can go stale, so this must never let a broken-image
// icon reach the institutional PDF.
async function resolvePhotoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  } catch {
    return null;
  }
}

function compCard(comp: CompHeroPdfComp, index: number): string {
  const photo = comp.photoUrl || placeholderPhotoDataUri();
  const bedsBaths =
    comp.beds != null || comp.baths != null
      ? `${comp.sqft ? comp.sqft.toLocaleString() + " SF · " : ""}${comp.beds ?? "—"} BD · ${comp.baths ?? "—"} BA`
      : comp.sqft
        ? `${comp.sqft.toLocaleString()} SF`
        : "";
  return `
    <div class="comp-card">
      <div class="comp-photo"><img src="${esc(photo)}" alt="" /></div>
      <div class="comp-details">
        <div class="comp-label">COMP ${index + 1}</div>
        <div class="comp-address">${esc(comp.address)}</div>
        <div class="comp-meta">${esc(bedsBaths)}</div>
        <div class="comp-rule"></div>
        <div class="comp-price">${comp.soldPrice != null ? fmtUSD(comp.soldPrice) : "—"}</div>
        <div class="comp-ppsf">${comp.pricePerSqft != null ? `$${comp.pricePerSqft} /SF` : ""}</div>
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
    .header-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16pt; }
    .wordmark { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 15pt; color: ${CHARCOAL}; }
    .header-right {
      font-family: 'Inter', sans-serif; font-size: 9pt; font-weight: 600; color: ${GRAY};
      text-transform: uppercase; letter-spacing: 0.12em;
    }

    .label-gold {
      font-family: 'Inter', sans-serif; font-size: 10pt; font-weight: 700; color: ${GOLD};
      text-transform: uppercase; letter-spacing: 0.12em;
    }

    .subject-block { display: flex; justify-content: space-between; gap: 24pt; margin-bottom: 12pt; }
    .subject-left { flex: 1.5; }
    .subject-right { flex: 1; text-align: right; }
    .page-title {
      font-family: 'Playfair Display', serif; font-weight: 700; font-size: 26pt; line-height: 1.1;
      margin: 5pt 0 8pt; color: ${CHARCOAL};
    }
    .subject-address { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 12.5pt; color: ${CHARCOAL}; margin-bottom: 3pt; }
    .subject-sub { font-family: 'Inter', sans-serif; font-size: 9pt; color: ${GRAY}; }
    .arv-value { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 30pt; color: ${CHARCOAL}; margin: 5pt 0 3pt; }
    .arv-range { font-family: 'Inter', sans-serif; font-size: 9pt; color: ${GRAY}; }

    .gold-rule { border-top: 0.5pt solid ${GOLD}; margin: 9pt 0; }

    .stats-row { display: flex; margin: 10pt 0; }
    .stat-col { flex: 1; padding: 0 14pt; position: relative; }
    .stat-col + .stat-col { border-left: 0.5pt solid ${GOLD}; }
    .stat-label { font-family: 'Inter', sans-serif; font-size: 9.5pt; font-weight: 700; color: ${GOLD}; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4pt; }
    .stat-value { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 20pt; color: ${CHARCOAL}; }

    .section-title {
      font-family: 'Inter', sans-serif; font-size: 10pt; font-weight: 700; color: ${GOLD};
      text-transform: uppercase; letter-spacing: 0.12em; margin: 2pt 0 9pt;
    }

    .comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; margin-bottom: 6pt; }
    .comp-card {
      display: flex; gap: 9pt; border: 0.5pt solid ${GOLD}; background: ${PAPER};
      padding: 8pt; height: 92pt;
    }
    .comp-photo { width: 76pt; height: 76pt; flex-shrink: 0; overflow: hidden; border: 0.5pt solid ${GOLD}; }
    .comp-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .comp-details { display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; }
    .comp-label { font-family: 'Inter', sans-serif; font-size: 7.5pt; font-weight: 700; color: ${GOLD}; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 2pt; }
    .comp-address { font-family: 'Playfair Display', serif; font-weight: 500; font-size: 11.5pt; color: ${CHARCOAL}; line-height: 1.15; margin-bottom: 2pt; }
    .comp-meta { font-family: 'Inter', sans-serif; font-size: 8pt; color: ${GRAY}; margin-bottom: 4pt; }
    .comp-rule { border-top: 0.5pt solid ${GOLD}; opacity: 0.5; margin-bottom: 4pt; width: 60%; }
    .comp-price { font-family: 'Playfair Display', serif; font-weight: 700; font-size: 14.5pt; color: ${GOLD}; }
    .comp-ppsf { font-family: 'Inter', sans-serif; font-size: 8pt; color: ${GRAY}; margin-top: 1pt; }

    .bottom-row { display: flex; gap: 24pt; margin-top: 6pt; }
    .chart-col { flex: 1; }
    .map-col { flex: 1; display: flex; flex-direction: column; align-items: flex-start; }
    .map-frame { border: 0.5pt solid ${GOLD}; }
    .map-frame img { display: block; width: 260pt; height: 175pt; object-fit: cover; }

    .footer-rule { border-top: 0.5pt solid ${GOLD}; position: absolute; left: 40pt; right: 40pt; bottom: 40pt; }
    .footer-row {
      position: absolute; left: 40pt; right: 40pt; bottom: 22pt;
      display: flex; gap: 6pt; font-family: 'Inter', sans-serif; font-size: 7pt; color: ${GRAY};
      font-style: italic;
    }
    .footer-row .dot { color: ${GOLD}; font-style: normal; }
  `;
}

function bottomRow(chartImgTag: string, mapSrc: string): string {
  return `
    <div class="bottom-row">
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

  const subjectSub = [subjectSqft ? `${subjectSqft.toLocaleString()} SF` : null, subjectStyle]
    .filter(Boolean)
    .join(" · ");

  const comps = selectedComps.slice(0, 8);
  const pageCount = comps.length <= COMPS_PER_PAGE ? 1 : 2;
  const page1Comps = comps.slice(0, COMPS_PER_PAGE);
  const page2Comps = comps.slice(COMPS_PER_PAGE, 8);

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

  const page1CardsHtml = page1Comps.map((c, i) => compCard(c, i)).join("");

  const page1 = `
    <div class="page">
      ${pageHeader()}
      ${subjectBlock}
      <div class="gold-rule"></div>
      ${subjectStatsRow}
      <div class="gold-rule"></div>
      <div class="section-title">Comparables</div>
      <div class="comp-grid">${page1CardsHtml}</div>
      ${pageCount === 1 ? bottomRow(chartImgTag, mapSrc) : ""}
      ${footer(preparedDate, 1, pageCount)}
    </div>
  `;

  const page2CardsHtml = page2Comps.map((c, i) => compCard(c, i + COMPS_PER_PAGE)).join("");
  const page2 =
    pageCount === 2
      ? `
    <div class="page">
      ${pageHeader()}
      <div class="section-title">Comparables (continued)</div>
      <div class="comp-grid">${page2CardsHtml}</div>
      <div class="gold-rule"></div>
      ${bottomRow(chartImgTag, mapSrc)}
      ${footer(preparedDate, 2, pageCount)}
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
  const rawComps = input.selectedComps.slice(0, 8);

  // Resolve any manual-comp photoUrls to inlined data: URIs up front (with
  // graceful null-on-failure) so compCard()'s placeholder fallback covers
  // both "no photo" AND "photo URL is dead/unreachable" — a broken-image
  // icon must never reach the rendered PDF.
  const resolvedPhotos = await Promise.all(rawComps.map((c) => resolvePhotoDataUri(c.photoUrl)));
  const comps = rawComps.map((c, i) => ({ ...c, photoUrl: resolvedPhotos[i] }));
  const input2: CompHeroPdfInput = { ...input, selectedComps: comps };

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

  const { html, filename } = await assembleHtml(input2, chartImgTag, map.src);

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
