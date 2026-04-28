import jsPDF from "jspdf";
import type { Deal, DealInputs } from "@shared/schema";
import { calculateDeal, fmtUSD, fmtPct } from "./calc";

export function exportDealPdf(deal: Deal, inputs: DealInputs) {
  const r = calculateDeal(inputs);
  const doc = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792

  const W = 612;
  const M = 48; // page margin
  let y = M;

  // ----- Color palette — navy + emerald to match the app -----
  const navy: [number, number, number] = [22, 38, 60];
  const emerald: [number, number, number] = [38, 153, 113];
  const gray: [number, number, number] = [110, 119, 128];
  const lightGray: [number, number, number] = [232, 234, 237];
  const text: [number, number, number] = [22, 30, 42];
  const danger: [number, number, number] = [196, 64, 64];

  // ----- Header band -----
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 80, "F");

  // Logo mark (three rising bars)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 32, 10, 16, 2, 2, "F");
  doc.roundedRect(M + 14, 24, 10, 24, 2, 2, "F");
  doc.roundedRect(M + 28, 16, 10, 32, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Flipline", M + 50, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(200, 210, 225);
  doc.text("Investor Deal Memo", M + 50, 56);

  doc.setFontSize(9);
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
      color: profitable ? emerald : danger,
    },
    {
      label: "ROI on Cash",
      value: fmtPct(r.roiOnCash),
      color: navy,
    },
    {
      label: "Annualized ROI",
      value: fmtPct(r.annualizedRoi),
      color: navy,
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
    doc.setTextColor(...navy);
    doc.text(title.toUpperCase(), x, yy);
    doc.setDrawColor(...emerald);
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
    emerald
  );
  lY += 14;
  row(
    "Net profit",
    fmtUSD(r.netProfit),
    M,
    lY,
    colW,
    true,
    profitable ? emerald : danger
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
    emerald
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

  // ----- Notes -----
  if (deal.notes && deal.notes.trim().length > 0) {
    y += 16;
    sectionTitle("Notes", M, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...text);
    const lines = doc.splitTextToSize(deal.notes, W - M * 2);
    doc.text(lines, M, y);
    y += lines.length * 13;
  }

  // ----- Disclaimer -----
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  const disc =
    "This memo is a pro forma projection based on the inputs above. Actual results may vary materially. Not investment advice.";
  doc.text(disc, M, 770, { maxWidth: W - M * 2 });

  const fname = `Flipline_${(deal.address || "deal")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .slice(0, 40)}.pdf`;
  doc.save(fname);
}
