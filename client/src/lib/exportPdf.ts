import jsPDF from "jspdf";
import type { Deal, DealInputs } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "./calc";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Draw the PropBoxIQ plaid mark — 2×2 grid: black, black, black, teal
 * with a house silhouette knocked out of the top-left cell.
 * Mirrors <Logo variant="full"> from client/src/components/Logo.tsx (80×80 viewBox).
 *
 * @param doc  jsPDF instance
 * @param x    top-left x in pt
 * @param y    top-left y in pt
 * @param size overall mark size in pt (renders at size × size)
 * @param ink  RGB triple for the dark cells
 * @param teal RGB triple for the accent cell
 */
function drawPropBoxIQMark(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  ink: [number, number, number],
  teal: [number, number, number]
) {
  // The Logo.tsx viewBox is 80x80; cells are 32x32 with 4pt rx, gutter ~4pt.
  // We map to `size` pt: scale = size / 80
  const s = size / 80;
  const cell = 32 * s;
  const rx = 4 * s;

  // Cell origins (top-left of each 32x32 in the 80x80 grid: 6 and 42)
  const c1x = x + 6 * s;
  const c1y = y + 6 * s;
  const c2x = x + 42 * s;
  const c2y = y + 6 * s;
  const c3x = x + 6 * s;
  const c3y = y + 42 * s;
  const c4x = x + 42 * s;
  const c4y = y + 42 * s;

  // Top-right, bottom-left: plain black
  doc.setFillColor(...ink);
  doc.roundedRect(c2x, c2y, cell, cell, rx, rx, "F");
  doc.roundedRect(c3x, c3y, cell, cell, rx, rx, "F");

  // Bottom-right: teal
  doc.setFillColor(...teal);
  doc.roundedRect(c4x, c4y, cell, cell, rx, rx, "F");

  // Top-left: black cell with house-shaped knockout.
  // jsPDF doesn't support compound paths with even-odd fill cleanly, so we
  // draw the black cell, then overlay a white house silhouette inside it
  // (the page background is white, so this reads as a knockout).
  doc.setFillColor(...ink);
  doc.roundedRect(c1x, c1y, cell, cell, rx, rx, "F");

  // House silhouette inside top-left cell. Logo coords (in 80x80 space):
  //   peak (22, 15) → roof to (30, 21) and (14, 21), walls down to y=32, gable wall back up.
  // Simplified pentagon: peak + 4 corners.
  const hx = (px: number, py: number): [number, number] => [x + px * s, y + py * s];
  const peak = hx(22, 15);
  const rRoof = hx(30, 21);
  const rBase = hx(30, 32);
  const lBase = hx(14, 32);
  const lRoof = hx(14, 21);

  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0);
  // Build a polygon via doc.lines (relative deltas)
  doc.lines(
    [
      [rRoof[0] - peak[0], rRoof[1] - peak[1]],
      [rBase[0] - rRoof[0], rBase[1] - rRoof[1]],
      [lBase[0] - rBase[0], lBase[1] - rBase[1]],
      [lRoof[0] - lBase[0], lRoof[1] - lBase[1]],
      [peak[0] - lRoof[0], peak[1] - lRoof[1]],
    ],
    peak[0],
    peak[1],
    [1, 1],
    "F"
  );
}

/**
 * Some deals store a comps JSON payload in `notes` (the auto-comp pull saves
 * `{ kind: "comps", compsData: {...} }`). When that's the case there is no
 * human-written notes string, so the PDF should NOT dump raw JSON.
 *
 * Returns:
 *   { kind: "comps", data }  — comps payload, render as a proper section
 *   { kind: "text", text }   — human-written notes
 *   null                     — empty / nothing to render
 */
function parseDealNotes(
  notes: string | null | undefined
):
  | { kind: "comps"; data: any }
  | { kind: "text"; text: string }
  | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  // Quick check: only attempt JSON.parse if it looks like JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj?.kind === "comps" && obj?.compsData) {
        return { kind: "comps", data: obj.compsData };
      }
      // Unknown JSON envelope — don't dump it, treat as nothing
      return null;
    } catch {
      // Not valid JSON — fall through and treat as plain text
    }
  }
  return { kind: "text", text: trimmed };
}

export function exportDealPdf(deal: Deal, inputs: DealInputs) {
  const r = calculateDeal(inputs);
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792

  const W = 612;
  const M = 48; // page margin
  let y = M;

  // ----- Coastal Teal palette to match the app -----
  const teal: [number, number, number] = [18, 109, 133]; // #126D85 brand
  const tealAccent: [number, number, number] = [95, 212, 231]; // #5fd4e7
  const ink: [number, number, number] = [10, 14, 18]; // #0a0e12
  const positive: [number, number, number] = [22, 138, 100];
  const gray: [number, number, number] = [110, 119, 128];
  const lightGray: [number, number, number] = [232, 234, 237];
  const text: [number, number, number] = [22, 30, 42];
  const danger: [number, number, number] = [196, 64, 64];

  // ----- Header band -----
  doc.setFillColor(...teal);
  doc.rect(0, 0, W, 80, "F");

  // ----- Logo: real PropBoxIQ plaid mark -----
  // White inner accent so the mark reads cleanly against the dark teal band.
  // Use white as the "ink" and tealAccent as the bright cell so the mark stays high-contrast on the band.
  drawPropBoxIQMark(
    doc,
    M - 6,
    8,
    64,
    [255, 255, 255], // ink → white on teal band
    tealAccent       // accent cell → light teal
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("PropBoxIQ", M + 70, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...tealAccent);
  doc.text("Investor Deal Memo", M + 70, 58);

  doc.setFontSize(9);
  doc.setTextColor(220, 240, 245);
  doc.text(
    `Prepared ${new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    W - M,
    40,
    { align: "right" }
  );

  y = 110;

  // ----- Property header -----
  doc.setTextColor(...text);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const addrLines = doc.splitTextToSize(deal.address, W - M * 2);
  doc.text(addrLines, M, y);
  y += addrLines.length * 18;

  if (deal.city && deal.state) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...gray);
    doc.text(`${deal.city}, ${deal.state} ${deal.zip ?? ""}`, M, y);
    y += 16;
  }

  y += 8;
  doc.setDrawColor(...lightGray);
  doc.line(M, y, W - M, y);
  y += 24;

  // ----- Hero KPIs -----
  const profitable = r.netProfit >= 0;
  const kpiBoxW = (W - M * 2 - 24) / 3;
  const kpiBoxH = 78;
  const kpis = [
    {
      label: "Projected Net Profit",
      value: fmtUSD(r.netProfit),
      color: profitable ? positive : danger,
    },
    {
      label: "ROI on Cash",
      value: fmtPct(r.roiOnCash),
      color: teal,
    },
    {
      label: "Annualized ROI",
      value: fmtPct(r.annualizedRoi),
      color: teal,
    },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (kpiBoxW + 12);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...lightGray);
    doc.roundedRect(x, y, kpiBoxW, kpiBoxH, 6, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text(k.label.toUpperCase(), x + 14, y + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...k.color);
    doc.text(k.value, x + 14, y + 54);
  });
  y += kpiBoxH + 28;

  // ----- Two-column section: Sources & Uses + Returns -----
  const colW = (W - M * 2 - 24) / 2;

  function sectionTitle(title: string, x: number, yy: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...teal);
    doc.text(title.toUpperCase(), x, yy);
    doc.setDrawColor(...tealAccent);
    doc.setLineWidth(1.5);
    doc.line(x, yy + 4, x + 36, yy + 4);
    doc.setLineWidth(1);
  }

  function row(
    label: string,
    val: string,
    x: number,
    yy: number,
    w: number,
    bold = false,
    color?: [number, number, number]
  ) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...(color ?? text));
    doc.text(label, x, yy);
    doc.text(val, x + w, yy, { align: "right" });
  }

  // Sources & Uses (left column)
  let lY = y;
  sectionTitle("Sources & Uses", M, lY);
  lY += 18;

  const usesRows: [string, string][] = [
    ["Purchase price", fmtUSD(inputs.purchasePrice)],
    ["Rehab budget", fmtUSD(inputs.rehabBudget)],
    [
      `Contingency (${inputs.rehabContingencyPct}%)`,
      fmtUSD(r.rehabContingency),
    ],
    [`Buy closing costs`, fmtUSD(r.buyClosing)],
    [
      `Holding (${inputs.holdingMonths} mo)`,
      fmtUSD(r.totalHoldingCost),
    ],
    [`Loan points + fees`, fmtUSD(r.loanPoints + inputs.loanFees)],
    [`Loan interest`, fmtUSD(r.interestCost)],
    [
      `Sell costs (closing + commission)`,
      fmtUSD(r.totalSellCosts),
    ],
  ];
  usesRows.forEach(([l, v]) => {
    row(l, v, M, lY, colW);
    lY += 14;
  });
  doc.setDrawColor(...lightGray);
  doc.line(M, lY + 2, M + colW, lY + 2);
  lY += 14;
  row("Total project cost", fmtUSD(r.totalProjectCost), M, lY, colW, true);
  lY += 16;
  row(
    "ARV (sale price)",
    fmtUSD(inputs.arv),
    M,
    lY,
    colW,
    true,
    positive
  );
  lY += 14;
  row(
    "Net profit",
    fmtUSD(r.netProfit),
    M,
    lY,
    colW,
    true,
    profitable ? positive : danger
  );

  // Returns (right column)
  const rX = M + colW + 24;
  let rY = y;
  sectionTitle("Returns & Decision Metrics", rX, rY);
  rY += 18;

  const retRows: [string, string][] = [
    ["Profit margin (% of ARV)", fmtPct(r.profitMarginPct)],
    ["ROI on cost", fmtPct(r.roiOnCost)],
    ["ROI on cash invested", fmtPct(r.roiOnCash)],
    ["Annualized ROI", fmtPct(r.annualizedRoi)],
    ["Cash invested", fmtUSD(r.totalCashInvested)],
    ["Loan amount", fmtUSD(r.loanAmount)],
    ["Cash needed at closing", fmtUSD(r.cashDownAtPurchase)],
  ];
  retRows.forEach(([l, v]) => {
    row(l, v, rX, rY, colW);
    rY += 14;
  });
  doc.setDrawColor(...lightGray);
  doc.line(rX, rY + 2, rX + colW, rY + 2);
  rY += 14;
  row(
    `Max allowable offer (${inputs.desiredProfitPct}% profit)`,
    fmtUSD(r.maxAllowableOffer),
    rX,
    rY,
    colW,
    true,
    positive
  );
  rY += 14;
  row("Break-even ARV", fmtUSD(r.breakEvenArv), rX, rY, colW, true);

  y = Math.max(lY, rY) + 32;

  // ----- Deal terms -----
  sectionTitle("Deal Terms", M, y);
  y += 18;
  const termRows: [string, string][] = [
    [
      "Financing",
      inputs.financingType === "hard_money"
        ? `Hard money · ${inputs.loanLtcPct}% LTC · ${inputs.loanRatePct}% · ${inputs.loanPointsPct} pts`
        : "All cash",
    ],
    ["Hold period", `${inputs.holdingMonths} months`],
    [
      "Buy / sell costs",
      `${inputs.buyClosingPct}% / ${
        inputs.sellClosingPct + inputs.agentCommissionPct
      }% (incl. ${inputs.agentCommissionPct}% commission)`,
    ],
    [
      "Monthly holding (taxes/ins/util)",
      fmtUSD(inputs.monthlyHoldingCosts),
    ],
  ];
  termRows.forEach(([l, v]) => {
    row(l, v, M, y, W - M * 2);
    y += 14;
  });

  // ----- Notes / Comps -----
  // notes can be a JSON "comps" envelope from the auto-comp pull, or plain text
  // the user typed. Never dump raw JSON — render comps as a clean summary, or skip.
  const parsedNotes = parseDealNotes(deal.notes);
  if (parsedNotes?.kind === "text") {
    y += 16;
    sectionTitle("Notes", M, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...text);
    const lines = doc.splitTextToSize(parsedNotes.text, W - M * 2);
    doc.text(lines, M, y);
    y += lines.length * 13;
  } else if (parsedNotes?.kind === "comps") {
    const data = parsedNotes.data;
    y += 16;
    sectionTitle("Comps Used", M, y);
    y += 18;

    // Summary line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    const summaryParts: string[] = [];
    summaryParts.push(`${data.compCount ?? data.comps?.length ?? 0} comps`);
    if (data.radiusMiles != null) summaryParts.push(`${data.radiusMiles} mi radius`);
    if (data.medianPricePerSqft) summaryParts.push(`median $${Math.round(data.medianPricePerSqft)}/sqft`);
    if (data.arvLow && data.arvHigh) {
      summaryParts.push(`ARV range ${fmtUSD(data.arvLow)}–${fmtUSD(data.arvHigh)}`);
    }
    doc.text(summaryParts.join("  ·  "), M, y);
    y += 14;

    // Top comps table (top 4 by price)
    const comps = Array.isArray(data.comps) ? data.comps.slice(0, 4) : [];
    if (comps.length > 0) {
      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...gray);
      const headerY = y + 4;
      const colAddr = M;
      const colPrice = M + 280;
      const colSqft = M + 360;
      const colPpsf = M + 410;
      const colDist = M + 460;
      doc.text("ADDRESS", colAddr, headerY);
      doc.text("PRICE", colPrice, headerY, { align: "right" });
      doc.text("SQFT", colSqft, headerY, { align: "right" });
      doc.text("$/SQFT", colPpsf, headerY, { align: "right" });
      doc.text("DIST", colDist, headerY, { align: "right" });
      y = headerY + 4;
      doc.setDrawColor(...lightGray);
      doc.line(M, y, W - M, y);
      y += 10;

      // Rows
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...text);
      comps.forEach((c: any) => {
        const addrLine = doc.splitTextToSize(c.address || "", 270)[0] ?? "";
        doc.text(addrLine, colAddr, y);
        doc.text(c.price ? fmtUSD(c.price) : "—", colPrice, y, { align: "right" });
        doc.text(c.sqft ? c.sqft.toLocaleString() : "—", colSqft, y, { align: "right" });
        doc.text(
          c.pricePerSqft ? `$${Math.round(c.pricePerSqft)}` : "—",
          colPpsf,
          y,
          { align: "right" }
        );
        doc.text(
          c.distance != null ? `${c.distance.toFixed(2)} mi` : "—",
          colDist,
          y,
          { align: "right" }
        );
        y += 13;
      });
    }
  }

  // ----- Disclaimer -----
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  const disc =
    "This memo is a pro forma projection based on the inputs above. Actual results may vary materially. Not investment advice.";
  doc.text(disc, M, 770, { maxWidth: W - M * 2 });

  const fname = `PropBoxIQ_${(deal.address || "deal")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 40)}.pdf`;
  doc.save(fname);
}

// ============================================================================
// Comparison PDF — side-by-side table, up to 4 deals on one landscape page.
// ============================================================================

interface CompareDeal {
  deal: Deal;
  inputs: DealInputs;
}

export function exportComparePdf(items: CompareDeal[]) {
  if (items.length === 0) return;
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

  // Real PropBoxIQ plaid mark (white on teal band)
  drawPropBoxIQMark(
    doc,
    M - 6,
    4,
    56,
    [255, 255, 255],
    tealAccent
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
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
    const addrLines = doc.splitTextToSize(c.deal.address || "", dealColW - 10);
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
  doc.save(fname);
}
