import jsPDF from "jspdf";
import type { Deal } from "@shared/schema";
import {
  BUDGET_CATEGORIES,
  categorySubtotal,
  budgetGrandTotal,
  type DealBudget,
} from "@shared/budgetTemplate";
import { fmtUSD } from "./calc";
import { PROPBOXIQ_LOGO_BLACK_PNG_DATA_URL } from "./propboxiqLogoData";

type RGB = [number, number, number];

// Parse a #rrggbb hex string into an RGB triple for jsPDF.
function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function buildBudgetPdf(deal: Deal, budget: DealBudget): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const W = 612;
  const H = 792;
  const M = 48;

  const teal: RGB = [18, 109, 133];
  const tealAccent: RGB = [95, 212, 231];
  const ink: RGB = [10, 14, 18];
  const gray: RGB = [110, 119, 128];
  const lightGray: RGB = [232, 234, 237];
  const text: RGB = [22, 30, 42];

  // ----- Header band -----
  doc.setFillColor(...teal);
  doc.rect(0, 0, W, 80, "F");
  doc.addImage(PROPBOXIQ_LOGO_BLACK_PNG_DATA_URL, "PNG", M - 4, 10, 60, 60, undefined, "FAST");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ink);
  doc.setFontSize(20);
  doc.text("PropBoxIQ", M + 70, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...tealAccent);
  doc.text("Walkthrough Budget", M + 70, 58);

  // Address (top-right) + date under it
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const addr = deal.name?.trim() || deal.address || "Property";
  const addrLines = doc.splitTextToSize(addr, 240);
  doc.text(addrLines.slice(0, 2), W - M, 34, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(220, 240, 245);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    W - M,
    64,
    { align: "right" },
  );

  let y = 112;
  const grand = budgetGrandTotal(budget);

  // Helper: draw a category section, returns new y.
  function drawCategory(catId: string, name: string, colorHex: string): void {
    const items = budget.categories[catId]?.items ?? [];
    const subtotal = categorySubtotal(budget, catId);
    const color = hexToRgb(colorHex);

    // Page-break guard: need room for header + at least one row.
    if (y > H - 120) {
      doc.addPage();
      y = M;
    }

    // Colored bar + category header
    doc.setFillColor(...color);
    doc.rect(M, y - 9, 4, 16, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...text);
    doc.text(name.toUpperCase(), M + 12, y + 3);
    doc.setTextColor(...teal);
    doc.text(fmtUSD(subtotal), W - M, y + 3, { align: "right" });
    y += 16;
    doc.setDrawColor(...lightGray);
    doc.line(M, y, W - M, y);
    y += 14;

    // Line items
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...text);
    for (const it of items) {
      if (y > H - 60) {
        doc.addPage();
        y = M;
      }
      doc.setTextColor(...(it.amount > 0 ? text : gray));
      doc.text(it.label || "—", M + 12, y);
      doc.text(fmtUSD(it.amount || 0), W - M, y, { align: "right" });
      y += 15;
    }
    y += 12;
  }

  for (const cat of BUDGET_CATEGORIES) {
    drawCategory(cat.id, cat.name, cat.color);
  }

  // ----- Footer summary: proportional stacked bar + grand total -----
  if (y > H - 120) {
    doc.addPage();
    y = M;
  }
  y += 4;
  doc.setDrawColor(...lightGray);
  doc.line(M, y, W - M, y);
  y += 20;

  // Mini stacked bar
  const barW = W - M * 2;
  const barH = 10;
  const barY = y;
  doc.setFillColor(...lightGray);
  doc.roundedRect(M, barY, barW, barH, 3, 3, "F");
  if (grand > 0) {
    let x = M;
    for (const cat of BUDGET_CATEGORIES) {
      const sub = categorySubtotal(budget, cat.id);
      if (sub <= 0) continue;
      const segW = (sub / grand) * barW;
      doc.setFillColor(...hexToRgb(cat.color));
      doc.rect(x, barY, segW, barH, "F");
      x += segW;
    }
  }
  y += barH + 26;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...text);
  doc.text("TOTAL REHAB", M, y);
  doc.setFontSize(20);
  doc.setTextColor(...teal);
  doc.text(fmtUSD(grand), W - M, y + 2, { align: "right" });

  // Footer small print
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text("Prepared with PropBoxIQ", M, H - 24);

  const safeAddr = (deal.name?.trim() || deal.address || "property")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `PropBoxIQ_Budget_${safeAddr}_${ymd}.pdf`;
  return { doc, filename };
}

export function exportBudgetPdf(deal: Deal, budget: DealBudget) {
  const { doc, filename } = buildBudgetPdf(deal, budget);
  doc.save(filename);
}
