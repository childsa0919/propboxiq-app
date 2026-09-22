import { jsPDF } from "jspdf";
import type { Deal, DealInputs } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "./calc";
import { PROPBOXIQ_LOGO_BLACK_PNG_DATA_URL } from "./propboxiqLogoData";
import { buildInstitutionalDealPdf, buildInstitutionalHoldPdf } from "./lenderMemoPdf";
import type { HoldInputs } from "./holdCalc";
import type { HoldWizardState } from "./holdState";

export function exportDealPdf(deal: Deal, inputs: DealInputs) {
  const { doc, filename } = buildInstitutionalDealPdf(deal, inputs);
  doc.save(filename);
}

export async function exportDealPdfBlob(
  deal: Deal,
  inputs: DealInputs,
): Promise<{ blob: Blob; base64: string; filename: string }> {
  const { doc, filename } = buildInstitutionalDealPdf(deal, inputs);
  return docToBlobAndBase64(doc, filename);
}

export function exportHoldPdf(state: HoldWizardState, inputs: HoldInputs) {
  const { doc, filename } = buildInstitutionalHoldPdf(state, inputs);
  doc.save(filename);
}

export async function exportHoldPdfBlob(state: HoldWizardState, inputs: HoldInputs) {
  const { doc, filename } = buildInstitutionalHoldPdf(state, inputs);
  return docToBlobAndBase64(doc, filename);
}

// ============================================================================
// Comparison PDF — side-by-side table, up to 4 deals on one landscape page.
// ============================================================================

interface CompareDeal {
  deal: Deal;
  inputs: DealInputs;
}

function buildComparePdf(items: CompareDeal[]): { doc: jsPDF; filename: string } | null {
  if (items.length === 0) return null;
  const slice = items.slice(0, 4); // landscape page fits 4 columns comfortably

  // Landscape letter: 792 x 612
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const W = 792;
  const H = 612;
  const M = 48;

  const teal: [number, number, number] = [18, 109, 133];
  const tealAccent: [number, number, number] = [95, 212, 231];
  const positive: [number, number, number] = [22, 138, 100];
  const danger: [number, number, number] = [196, 64, 64];
  const gray: [number, number, number] = [110, 119, 128];
  const lightGray: [number, number, number] = [232, 234, 237];
  const text: [number, number, number] = [22, 30, 42];

  // ----- Header band -----
  doc.setFillColor(...teal);
  doc.rect(0, 0, W, 70, "F");

  // Pixel-perfect raster of the real PropBoxIQ mark (all-black variant)
  doc.addImage(
    PROPBOXIQ_LOGO_BLACK_PNG_DATA_URL,
    "PNG",
    M - 4,
    6,
    52,
    52,
    undefined,
    "FAST"
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(10, 14, 18);
  doc.setFontSize(16);
  doc.text("PropBoxIQ", M + 60, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...tealAccent);
  doc.text("Deal Comparison", M + 60, 50);

  doc.setTextColor(220, 240, 245);
  doc.text(
    `Prepared ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    W - M,
    36,
    { align: "right" }
  );
  doc.text(`${slice.length} deals`, W - M, 50, { align: "right" });

  // ----- Pre-compute results for each deal -----
  const computed = slice.map(({ deal, inputs }) => ({
    deal,
    inputs,
    r: calculateDeal(inputs),
  }));

  // ----- Table layout -----
  const labelColW = 170;
  const dealColW = (W - M * 2 - labelColW) / slice.length;
  let y = 100;

  // Header row — addresses
  doc.setFillColor(248, 250, 252);
  doc.rect(M, y - 14, W - M * 2, 56, "F");
  doc.setDrawColor(...lightGray);
  doc.line(M, y + 42, W - M, y + 42);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...gray);
  doc.text("PROPERTY", M + 8, y);

  computed.forEach((c, i) => {
    const x = M + labelColW + i * dealColW;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...text);
    const addrLines = doc.splitTextToSize(
      c.deal.name?.trim() || c.deal.address || "",
      dealColW - 10,
    );
    doc.text(addrLines.slice(0, 2), x + 6, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    const sub = [c.deal.city, c.deal.state].filter(Boolean).join(", ");
    if (sub) doc.text(sub, x + 6, y + 28);
  });

  y += 60;

  // ----- Highlight winners per row -----
  function bestIndex(values: number[], higherIsBetter = true): number {
    let best = 0;
    for (let i = 1; i < values.length; i++) {
      if (
        (higherIsBetter && values[i] > values[best]) ||
        (!higherIsBetter && values[i] < values[best])
      ) {
        best = i;
      }
    }
    return best;
  }

  // Each row: label + array of values + which-is-best behavior
  type RowDef = {
    label: string;
    values: string[];
    raw: number[];
    higherIsBetter: boolean;
    isHero?: boolean;
  };

  const rows: RowDef[] = [
    {
      label: "Net Profit",
      values: computed.map((c) => fmtUSD(c.r.netProfit)),
      raw: computed.map((c) => c.r.netProfit),
      higherIsBetter: true,
      isHero: true,
    },
    {
      label: "ROI on Cash",
      values: computed.map((c) => fmtPct(c.r.roiOnCash)),
      raw: computed.map((c) => c.r.roiOnCash),
      higherIsBetter: true,
      isHero: true,
    },
    {
      label: "Annualized ROI",
      values: computed.map((c) => fmtPct(c.r.annualizedRoi)),
      raw: computed.map((c) => c.r.annualizedRoi),
      higherIsBetter: true,
      isHero: true,
    },
    {
      label: "Profit Margin (% of ARV)",
      values: computed.map((c) => fmtPct(c.r.profitMarginPct)),
      raw: computed.map((c) => c.r.profitMarginPct),
      higherIsBetter: true,
    },
    {
      label: "ARV",
      values: computed.map((c) => fmtUSD(c.inputs.arv)),
      raw: computed.map((c) => c.inputs.arv),
      higherIsBetter: true,
    },
    {
      label: "Purchase Price",
      values: computed.map((c) => fmtUSD(c.inputs.purchasePrice)),
      raw: computed.map((c) => c.inputs.purchasePrice),
      higherIsBetter: false,
    },
    {
      label: "Max Allowable Offer",
      values: computed.map((c) => fmtUSD(c.r.maxAllowableOffer)),
      raw: computed.map((c) => c.r.maxAllowableOffer),
      higherIsBetter: true,
    },
    {
      label: "Rehab Budget",
      values: computed.map((c) =>
        fmtUSD(c.inputs.rehabBudget + c.r.rehabContingency)
      ),
      raw: computed.map(
        (c) => c.inputs.rehabBudget + c.r.rehabContingency
      ),
      higherIsBetter: false,
    },
    {
      label: "Hold (months)",
      values: computed.map((c) => `${c.inputs.holdingMonths}`),
      raw: computed.map((c) => c.inputs.holdingMonths),
      higherIsBetter: false,
    },
    {
      label: "Total Project Cost",
      values: computed.map((c) => fmtUSD(c.r.totalProjectCost)),
      raw: computed.map((c) => c.r.totalProjectCost),
      higherIsBetter: false,
    },
    {
      label: "Cash Invested",
      values: computed.map((c) => fmtUSD(c.r.totalCashInvested)),
      raw: computed.map((c) => c.r.totalCashInvested),
      higherIsBetter: false,
    },
    {
      label: "Loan Amount",
      values: computed.map((c) => fmtUSD(c.r.loanAmount)),
      raw: computed.map((c) => c.r.loanAmount),
      higherIsBetter: false,
    },
    {
      label: "Break-even ARV",
      values: computed.map((c) => fmtUSD(c.r.breakEvenArv)),
      raw: computed.map((c) => c.r.breakEvenArv),
      higherIsBetter: false,
    },
  ];

  // Render each row
  rows.forEach((r) => {
    const winner = bestIndex(r.raw, r.higherIsBetter);
    const rowH = r.isHero ? 24 : 18;

    if (r.isHero) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y - 12, W - M * 2, rowH, "F");
    }

    // Label
    doc.setFont("helvetica", r.isHero ? "bold" : "normal");
    doc.setFontSize(r.isHero ? 10 : 9);
    doc.setTextColor(...text);
    doc.text(r.label, M + 8, y);

    // Values
    r.values.forEach((v, i) => {
      const x = M + labelColW + i * dealColW;
      const isWinner = i === winner && r.raw.length > 1;
      const profitable =
        r.label === "Net Profit" ? r.raw[i] >= 0 : true;

      // Winner highlight pill
      if (isWinner && r.isHero) {
        doc.setFillColor(...tealAccent);
        doc.roundedRect(
          x + dealColW - 36,
          y - 8,
          28,
          12,
          3,
          3,
          "F"
        );
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...teal);
        doc.text("BEST", x + dealColW - 22, y, { align: "center" });
      }

      doc.setFont("helvetica", isWinner ? "bold" : "normal");
      doc.setFontSize(r.isHero ? 11 : 10);
      let color: [number, number, number] = text;
      if (r.label === "Net Profit") {
        color = profitable ? positive : danger;
      } else if (isWinner && r.isHero) {
        color = teal;
      }
      doc.setTextColor(...color);
      doc.text(v, x + 6, y);
    });

    // Subtle separator
    doc.setDrawColor(...lightGray);
    doc.line(M, y + (r.isHero ? 12 : 8), W - M, y + (r.isHero ? 12 : 8));

    y += rowH;
  });

  // ----- Verdict line -----
  y += 16;
  const profitWinner = bestIndex(
    computed.map((c) => c.r.netProfit),
    true
  );
  const roiWinner = bestIndex(
    computed.map((c) => c.r.roiOnCash),
    true
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...teal);
  doc.text("VERDICT", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...text);
  const profitAddr = computed[profitWinner].deal.address || `Deal ${profitWinner + 1}`;
  const roiAddr = computed[roiWinner].deal.address || `Deal ${roiWinner + 1}`;
  let verdict: string;
  if (profitWinner === roiWinner) {
    verdict = `${profitAddr} wins on both raw profit and return on cash.`;
  } else {
    verdict = `${profitAddr} delivers the highest dollar profit; ${roiAddr} delivers the strongest cash-on-cash return.`;
  }
  doc.text(doc.splitTextToSize(verdict, W - M * 2 - 80), M + 60, y);

  // ----- Footer disclaimer -----
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text(
    "Pro forma projections based on user inputs. Actual results may vary materially. Not investment advice.",
    M,
    H - 24,
    { maxWidth: W - M * 2 }
  );

  const fname = `PropBoxIQ_Compare_${slice.length}deals_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  return { doc, filename: fname };
}

export function exportComparePdf(items: CompareDeal[]) {
  const built = buildComparePdf(items);
  if (!built) return;
  built.doc.save(built.filename);
}

export async function exportComparePdfBlob(
  items: CompareDeal[],
): Promise<{ blob: Blob; base64: string; filename: string } | null> {
  const built = buildComparePdf(items);
  if (!built) return null;
  return docToBlobAndBase64(built.doc, built.filename);
}

// ──────────────────────────────────────────────────────────────────────
async function docToBlobAndBase64(
  doc: jsPDF,
  filename: string,
): Promise<{ blob: Blob; base64: string; filename: string }> {
  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const bytes = new Uint8Array(arrayBuffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    for (let j = 0; j < sub.length; j++) bin += String.fromCharCode(sub[j]);
  }
  const base64 = btoa(bin);
  return { blob, base64, filename };
}
