// Comp Hero PDF export (v1.7.4) — reuses the PR #26 Walkthrough Budget PDF
// pipeline conventions: jsPDF letter format, Coastal Teal header band with the
// PropBoxIQ mark, page-break guards, footer with generated date/time + deal ID
// + "propboxiq.com" + page numbers when the doc spans 2+ pages. Layout mirrors
// the on-screen Comp Hero view minus the sticky action bar.

import jsPDF from "jspdf";
import type { Deal } from "@shared/schema";
import { fmtUSD } from "./calc";
import { PROPBOXIQ_LOGO_BLACK_PNG_DATA_URL } from "./propboxiqLogoData";
import type { CompHeroCardData, CompHeroStats } from "@/components/CompHero/types";

type RGB = [number, number, number];

const TEAL: RGB = [18, 109, 133];
const CYAN_ACCENT: RGB = [95, 212, 231];
const GOLD: RGB = [245, 201, 72];
const INK: RGB = [10, 14, 18];
const GRAY: RGB = [110, 119, 128];
const LIGHT_GRAY: RGB = [232, 234, 237];
const TEXT: RGB = [22, 30, 42];

export interface CompHeroPdfInput {
  deal: Deal;
  subjectAddress: string;
  subjectSqft: number | null;
  subjectStyle: string | null;
  arv: number | null;
  arvLow: number | null;
  arvHigh: number | null;
  stats: CompHeroStats;
  selectedComps: CompHeroCardData[];
}

function buildCompHeroPdf(input: CompHeroPdfInput): { doc: jsPDF; filename: string } {
  const { deal, subjectAddress, subjectSqft, subjectStyle, arv, arvLow, arvHigh, stats, selectedComps } =
    input;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612;
  const H = 792;
  const M = 48;

  // ----- Header band -----
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 80, "F");
  doc.addImage(PROPBOXIQ_LOGO_BLACK_PNG_DATA_URL, "PNG", M - 4, 10, 60, 60, undefined, "FAST");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.setFontSize(20);
  doc.text("PropBoxIQ", M + 70, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GOLD);
  doc.text("Comp Hero", M + 70, 58);

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const addrLines = doc.splitTextToSize(subjectAddress || "Property", 240);
  doc.text(addrLines.slice(0, 2), W - M, 34, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(220, 240, 245);
  doc.text(
    `Generated ${new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`,
    W - M,
    64,
    { align: "right" },
  );

  let y = 112;

  // ----- Subject + ARV -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...CYAN_ACCENT);
  doc.text("SUBJECT PROPERTY", M, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEXT);
  doc.text(subjectAddress || "—", M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  const chipBits = [
    subjectSqft ? `${subjectSqft.toLocaleString()} sqft` : null,
    subjectStyle,
  ].filter(Boolean);
  if (chipBits.length) doc.text(chipBits.join("  ·  "), M, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text("COMP HERO ARV", M, y);
  doc.setFontSize(24);
  doc.setTextColor(...GOLD);
  doc.text(arv != null ? fmtUSD(arv) : "—", W - M, y + 2, { align: "right" });
  y += 8;
  if (arvLow != null && arvHigh != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Range ${fmtUSD(arvLow)} – ${fmtUSD(arvHigh)}`, W - M, y + 14, { align: "right" });
  }
  y += 28;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.line(M, y, W - M, y);
  y += 20;

  // ----- KPI row -----
  const kpis: [string, string][] = [
    ["$/SQFT", stats.avgPpsf != null ? `$${stats.avgPpsf}` : "—"],
    ["LOW", stats.lowPpsf != null ? fmtUSD(stats.lowPpsf) : "—"],
    ["HIGH", stats.highPpsf != null ? fmtUSD(stats.highPpsf) : "—"],
    ["COMPS", String(stats.selectedCount)],
  ];
  const kpiW = (W - M * 2) / 4;
  kpis.forEach(([label, value], i) => {
    const x = M + i * kpiW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(label, x, y);
    doc.setFontSize(13);
    doc.setTextColor(...TEXT);
    doc.text(value, x, y + 16);
  });
  y += 34;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.line(M, y, W - M, y);
  y += 20;

  // ----- Comp list (selected only) -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT);
  doc.text(`SELECTED COMPS (${selectedComps.length})`, M, y);
  y += 16;

  for (const c of selectedComps) {
    if (y > H - 90) {
      addFooter(doc, deal, W, H, M);
      doc.addPage();
      y = M + 10;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT);
    doc.text(c.address, M, y);
    if (c.soldPrice != null) {
      doc.setTextColor(...TEAL);
      doc.text(fmtUSD(c.soldPrice), W - M, y, { align: "right" });
    }
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    const bits = [
      c.sqft ? `${c.sqft.toLocaleString()} sqft` : null,
      c.pricePerSqft ? `$${c.pricePerSqft}/sqft` : null,
      c.beds != null || c.baths != null ? `${c.beds ?? "—"}bd/${c.baths ?? "—"}ba` : null,
      c.isManual ? "Manual entry" : null,
    ].filter(Boolean);
    doc.text(bits.join("  ·  "), M, y);
    y += 8;
    doc.setDrawColor(...LIGHT_GRAY);
    doc.line(M, y, W - M, y);
    y += 12;
  }

  addFooter(doc, deal, W, H, M);
  addPageNumbers(doc, W, H, M);

  const safeAddr = (deal.name?.trim() || deal.address || "property")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `PropBoxIQ_CompHero_${safeAddr}_${ymd}.pdf`;
  return { doc, filename };
}

function addFooter(doc: jsPDF, deal: Deal, W: number, H: number, M: number) {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(
    `Generated ${new Date().toLocaleString()} · Deal #${deal.id} · propboxiq.com`,
    M,
    H - 24,
  );
}

function addPageNumbers(doc: jsPDF, W: number, H: number, M: number) {
  const pageCount = doc.getNumberOfPages();
  if (pageCount < 2) return;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`Page ${i} of ${pageCount}`, W - M, H - 24, { align: "right" });
  }
}

export function exportCompHeroPdf(input: CompHeroPdfInput) {
  const { doc, filename } = buildCompHeroPdf(input);
  doc.save(filename);
}
