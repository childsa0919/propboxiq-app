import { jsPDF } from "jspdf";
import type { Deal, DealInputs } from "@shared/schema";
import { calculateDeal, fmtPct, fmtUSD } from "./calc";
import { calculateHold, type HoldInputs } from "./holdCalc";
import type { HoldWizardState } from "./holdState";
import { computeDealScore } from "./dealScore";

type RGB = [number, number, number];
type Row = [label: string, value: string, strong?: boolean];
const NAVY: RGB = [15, 46, 61];
const TEAL: RGB = [18, 109, 133];
const INK: RGB = [23, 33, 43];
const MUTED: RGB = [99, 113, 122];
const RULE: RGB = [217, 224, 227];
const WHITE: RGB = [255, 255, 255];
const M = 40, W = 612, CW = W - 2 * M, BOTTOM = 720;
const money = (n: unknown) => typeof n === "number" && Number.isFinite(n) ? fmtUSD(n) : "Not supplied";
const ratio = (n: number, d: number) => d > 0 ? fmtPct(n / d * 100) : "N/A";
const fileName = (name: string, strategy: string) =>
  `PropBoxIQ_${strategy}_${name.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60) || "deal"}.pdf`;

/** Print-only composition. No changes to application styling or underwriting engines. */
class LenderMemo {
  doc = new jsPDF({ unit: "pt", format: "letter" });
  y = 100;
  date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  constructor(private address: string, private strategy: string) {
    this.doc.setProperties({ title: `${address} | PropBoxIQ Investment Memo`, author: "PropBoxIQ" });
    this.header();
  }

  text(value: string, x: number, y: number, size = 9, bold = false, color = INK, right = false) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
    this.doc.text(value, x, y, right ? { align: "right" } : {});
  }

  line(x: number, y: number, width: number, color = RULE) {
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(0.5);
    this.doc.line(x, y, x + width, y);
  }

  header() {
    const d = this.doc;
    d.setFillColor(...NAVY);
    d.rect(0, 0, W, 76, "F");
    d.setFillColor(...TEAL);
    d.rect(0, 76, W, 3, "F");
    // Compact geometric brand mark, kept vector-sharp in print.
    [[0, 0], [12, 0], [0, 12], [12, 12]].forEach(([x, y], n) => {
      d.setFillColor(...(n === 3 ? [95, 212, 231] as RGB : WHITE));
      d.rect(M + x, 25 + y, 9, 9, "F");
    });
    d.setFillColor(...NAVY);
    d.lines([[2.6, 2], [0, 3.6], [-5.2, 0], [0, -3.6], [2.6, -2]],
      M + 4.5, 27, [1, 1], "F", true);
    this.text("PropBoxIQ", M + 33, 43, 21, true, WHITE);
    this.text("PRIVATE EQUITY UNDERWRITING", M, 63, 7.5, false, [191, 211, 219]);
    this.text("INVESTMENT MEMORANDUM", W - M, 32, 8, true, WHITE, true);
    this.text(`${this.strategy}  /  ${this.date}`, W - M, 49, 8, false, [191, 211, 219], true);
    this.y = 103;
  }

  page() {
    this.doc.addPage();
    this.header();
  }

  ensure(height: number) {
    if (this.y + height > BOTTOM) this.page();
  }

  paragraph(value: string, size = 9, color = MUTED) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(size);
    const lines = this.doc.splitTextToSize(value, CW) as string[];
    for (const line of lines) {
      this.ensure(size * 1.55);
      this.text(line, M, this.y, size, false, color);
      this.y += size * 1.55;
    }
    this.y += 8;
  }

  section(title: string) {
    this.ensure(54);
    this.y += 9;
    this.text(title.toUpperCase(), M, this.y, 9, true, NAVY);
    this.line(M, this.y + 8, CW, TEAL);
    this.y += 28;
  }

  identity(name: string, location?: string) {
    this.text("RESIDENTIAL VALUE-ADD  /  INDICATIVE ANALYSIS", M, this.y, 7.5, true, TEAL);
    this.y += 26;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(22);
    const lines = this.doc.splitTextToSize(name, CW) as string[];
    for (const line of lines) {
      this.ensure(28);
      this.text(line, M, this.y, 22, true, NAVY);
      this.y += 26;
    }
    if (name !== this.address) this.paragraph(this.address);
    if (location) this.paragraph(location);
    this.y += 4;
  }

  decision(score: number, position: string, rationale: string, scoreBasis: string) {
    this.ensure(160);
    this.doc.setFillColor(...NAVY);
    this.doc.rect(M, this.y, CW, 66, "F");
    this.text("INVESTMENT POSITION", M + 14, this.y + 16, 7, true, [191, 211, 219]);
    this.doc.setFontSize(10);
    const lines = this.doc.splitTextToSize(position, 306) as string[];
    lines.forEach((line, n) => this.text(line, M + 14, this.y + 34 + n * 12, 10, true, WHITE));
    this.text("PROPBOXIQ UNDERWRITING SCORE", W - M - 13, this.y + 16, 6.2, true, [191, 211, 219], true);
    this.text(`${score} / 100`, W - M - 13, this.y + 42, 23, true, WHITE, true);
    this.text(scoreBasis, W - M - 13, this.y + 56, 6.7, false, [191, 211, 219], true);
    this.y += 84;
    this.paragraph(rationale, 9, INK);
  }

  metrics(metrics: Row[]) {
    this.ensure(85);
    const width = CW / 4;
    this.line(M, this.y, CW);
    metrics.forEach(([label, value], i) => {
      const x = M + i * width;
      if (i) {
        this.doc.setDrawColor(...RULE);
        this.doc.line(x - 9, this.y + 12, x - 9, this.y + 56);
      }
      this.text(label.toUpperCase(), x, this.y + 20, 6.7, true, MUTED);
      this.doc.setFont("helvetica", "bold");
      let size = 23;
      this.doc.setFontSize(size);
      while (this.doc.getTextWidth(value) > width - 20 && size > 9) this.doc.setFontSize(--size);
      this.text(value, x, this.y + 47, size, true, NAVY);
    });
    this.line(M, this.y + 65, CW);
    this.y += 88;
  }

  /** Two aligned schedules; entire block moves to a fresh page if needed. */
  schedules(leftTitle: string, left: Row[], rightTitle: string, right: Row[]) {
    const colW = (CW - 28) / 2;
    const rowHeights = (rows: Row[]) => rows.map(([label, value]) => {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      return Math.max(this.doc.splitTextToSize(label, colW - 103).length,
        this.doc.splitTextToSize(value, 94).length) * 11 + 9;
    });
    const lh = rowHeights(left), rh = rowHeights(right);
    const height = Math.max(lh.reduce((a, b) => a + b, 0), rh.reduce((a, b) => a + b, 0)) + 38;
    this.ensure(height);
    const top = this.y;
    const draw = (title: string, rows: Row[], x: number, heights: number[]) => {
      this.text(title.toUpperCase(), x, top, 9, true, NAVY);
      this.line(x, top + 8, colW, TEAL);
      let y = top + 28;
      rows.forEach(([label, value, strong], i) => {
        this.doc.setFont("helvetica", strong ? "bold" : "normal");
        this.doc.setFontSize(8.5);
        const labels = this.doc.splitTextToSize(label, colW - 103) as string[];
        const values = this.doc.splitTextToSize(value, 94) as string[];
        labels.forEach((line, n) => this.text(line, x, y + n * 11, 8.5, strong, strong ? NAVY : MUTED));
        values.forEach((line, n) => this.text(line, x + colW, y + n * 11, 8.5, strong, INK, true));
        this.line(x, y + heights[i] - 14, colW);
        y += heights[i];
      });
    };
    draw(leftTitle, left, M, lh);
    draw(rightTitle, right, M + colW + 28, rh);
    this.y = top + height;
  }

  finish() {
    const pages = this.doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      this.doc.setPage(page);
      this.line(M, 743, CW);
      this.text("CONFIDENTIAL UNDERWRITING  /  PROPBOXIQ", M, 758, 7, true, MUTED);
      this.text(`Page ${page} of ${pages}`, W - M, 758, 7, false, MUTED, true);
      this.text("Projected figures only. Subject to independent lender verification.", M, 773, 6.8, false, MUTED);
    }
    return this.doc;
  }
}

function disclosures(m: LenderMemo) {
  m.section("Assumptions & risk");
  m.paragraph("VALUATION & EXECUTION  |  Confirm appraisal, comparable-sale condition, title, inspections, contractor scope, contingency, insurance and the construction schedule before funding. Market evidence is indicative and may be incomplete or stale.");
  m.paragraph("FINANCING & EXIT  |  Loan figures are modeled assumptions, not a lender commitment or approved loan request. Confirm advance rates, draw timing, reserves, fees, maturity and repayment terms. Sale prices, rents, vacancy, costs and timing may vary materially.");
  m.paragraph("SCORE & LIMITATIONS  |  The PropBoxIQ Underwriting Score is an internal analytical indicator, not a credit decision, appraisal, valuation or guarantee. This pro forma is not investment advice. All figures are projections subject to lender underwriting and independent verification.");
}

function flipEvidence(m: LenderMemo, deal: Deal) {
  m.section("Market evidence");
  let note: any;
  try { note = JSON.parse(deal.notes || "null"); } catch { /* Plain-text investor notes. */ }
  if (note?.kind === "comps" && Array.isArray(note.compsData?.comps)) {
    const excluded = new Set(Array.isArray(note.excludedCompIds) ? note.excludedCompIds : []);
    const comps = note.compsData.comps;
    const active = comps.filter((c: any) => !excluded.has(c.id));
    const top = [...active].sort((a: any, b: any) => (b.price || 0) - (a.price || 0)).slice(0, 4);
    m.paragraph(`${active.length} active comparable sales; ${comps.length - active.length} excluded by investor. Highest-price four active sales shown below, consistent with the existing comp selection. The financial schedules retain the entered ARV; comparable prices are supporting evidence, not a new appraisal.`);
    const drawComp = (c: any) => {
      m.ensure(65);
      m.paragraph(`${c.address || "Address not supplied"}  |  ${money(c.price)}`, 10, INK);
      m.paragraph(`${typeof c.sqft === "number" ? c.sqft.toLocaleString() + " SF" : "Area not supplied"}  /  ${typeof c.pricePerSqft === "number" ? money(c.pricePerSqft) + " per SF" : "$/SF not supplied"}  /  ${typeof c.distance === "number" ? c.distance.toFixed(2) + " mi" : "Distance not supplied"}`, 8);
    };
    top.forEach(drawComp);
    if (comps.some((c: any) => excluded.has(c.id))) {
      m.section("Excluded by investor");
      comps.filter((c: any) => excluded.has(c.id)).forEach(drawComp);
    }
    m.paragraph("Evidence source: saved comparable-sales snapshot. Data date: Not supplied. Verify sale dates, condition and selection independently.", 8);
  } else {
    m.paragraph("Comparable sales: Not supplied. ZIP market statistics and data date: Not supplied. Obtain current closed-sale support and an independent appraisal before relying on the modeled value.");
  }
  disclosures(m);
  if (deal.notes?.trim() && !note && !/^[{[]/.test(deal.notes.trim())) {
    m.section("Investor notes");
    m.paragraph(deal.notes, 9, INK);
  }
}

export function buildInstitutionalDealPdf(deal: Deal, inputs: DealInputs) {
  // Exactly the same locale-aware call as QuickResult; honors manual overrides.
  const r = calculateDeal(inputs, { state: deal.state, city: deal.city });
  const score = computeDealScore(r.roiOnCash, r.profitMarginPct, inputs.holdingMonths);
  const isCash = inputs.isCashPurchase === true || inputs.financingType === "cash";
  const m = new LenderMemo(deal.address, "FLIP / RESALE");
  m.identity(deal.name?.trim() || deal.address, [deal.city, deal.state, deal.zip].filter(Boolean).join("  "));
  const position = r.netProfit <= 0 ? "ELEVATED RISK / REASSESS ACQUISITION BASIS"
    : score >= 70 ? "PROCEED SUBJECT TO RENOVATION VALIDATION" : "CONDITIONAL / REVIEW KEY ASSUMPTIONS";
  m.decision(score, position,
    `Modeled net profit of ${money(r.netProfit)} over ${inputs.holdingMonths} months, with ${fmtPct(r.roiOnCash)} return on modeled cash exposure. Final proceeds depend on the entered ${money(inputs.arv)} sale value and validated project costs.`,
    "Flip strategy");
  m.metrics([
    ["Projected net profit", money(r.netProfit)], ["ROI on cash", fmtPct(r.roiOnCash)],
    ["After-repair value", money(inputs.arv)], ["Hold period", `${inputs.holdingMonths} mo`],
  ]);
  m.schedules("Sources & uses", [
    ["Purchase price", money(inputs.purchasePrice)],
    ["Renovation budget", money(inputs.rehabBudget)],
    [`Contingency (${inputs.rehabContingencyPct}%)`, money(r.rehabContingency)],
    ["Acquisition closing", money(r.buyClosing)],
    ["Financing costs", money(r.totalFinancingCost)],
    ["Holding costs", money(r.totalHoldingCost)],
    ["Selling costs", money(r.totalSellCosts)],
    ["Total project cost", money(r.totalProjectCost), true],
    ["Modeled loan proceeds", money(r.loanAmount)],
    ["Modeled cash exposure", money(r.totalCashInvested), true],
  ], "Return profile", [
    ["Projected sale price", money(inputs.arv)],
    ["Projected net profit", money(r.netProfit), true],
    ["Profit margin", fmtPct(r.profitMarginPct)],
    ["ROI on total cost", fmtPct(r.roiOnCost)],
    ["ROI on cash", fmtPct(r.roiOnCash)],
    ["Annualized ROI (simple)", fmtPct(r.annualizedRoi)],
    ["Cash needed at closing", money(r.cashDownAtPurchase)],
    ["Loan / ARV", ratio(r.loanAmount, inputs.arv)],
    ["Loan / purchase + rehab", ratio(r.loanAmount, inputs.purchasePrice + r.totalRehab)],
    ["Target profit margin", fmtPct(inputs.desiredProfitPct)],
  ]);
  m.section("Financing assumptions");
  m.paragraph(isCash
    ? "ALL CASH  |  No acquisition debt modeled. Loan proceeds, interest and loan fees are excluded by the calculation engine unless a manual cost override is present."
    : `HARD MONEY  |  ${fmtPct(inputs.loanRatePct)} interest; ${inputs.loanPointsPct} points; ${money(inputs.loanFees)} fees. ${inputs.holdingMonths}-month modeled hold; loan maturity and draw schedule are not supplied. Interest assumes the full modeled balance is outstanding.`, 8.5);
  m.page();
  m.text("SUPPORTING SCHEDULES", M, m.y, 17, true, NAVY);
  m.y += 24;
  m.paragraph(deal.address);
  m.schedules("Decision references", [
    ["Max allowable offer", money(r.maxAllowableOffer)],
    ["Break-even ARV", money(r.breakEvenArv)],
  ], "Cost conventions", [
    ["Holding period", `${inputs.holdingMonths} months`],
    ["Project-cost basis", "Includes sale costs"],
  ]);
  m.paragraph("Decision references use the existing calculation engine. The maximum-offer and break-even models retain their existing flat-rate assumptions and may differ from the locale-adjusted base case. Cash exposure is a modeled total, not a lender draw schedule.", 8);
  flipEvidence(m, deal);
  return { doc: m.finish(), filename: fileName(deal.name?.trim() || deal.address, "Flip") };
}

export function buildInstitutionalHoldPdf(state: HoldWizardState, inputs: HoldInputs) {
  // `inputs` is the effective state after operating-expense edits in HoldResult.
  const r = calculateHold(inputs);
  const m = new LenderMemo(state.address || "Property address not supplied", "HOLD / RENTAL");
  m.identity(state.address || "Property address not supplied", state.zip ? `ZIP ${state.zip}` : undefined);
  const position = r.monthlyCashFlow < 0 || (r.loanAmount > 0 && r.dscr < 1)
    ? "ELEVATED RISK / DEBT COVERAGE REQUIRES REVIEW"
    : r.longScore >= 70 ? "PROCEED SUBJECT TO RENT & EXPENSE VALIDATION" : "CONDITIONAL / REVIEW OPERATING ASSUMPTIONS";
  m.decision(r.longScore, position,
    `Year-one modeled cash flow is ${money(r.monthlyCashFlow)} per month on ${money(r.cashInvested)} invested cash. ${r.loanAmount > 0 ? `Debt coverage is ${r.dscr.toFixed(2)}x.` : "No acquisition debt is modeled."} Rent, operating costs and reserve allowances require verification.`,
    "Long-term hold strategy");
  m.metrics([
    ["Monthly cash flow", money(r.monthlyCashFlow)], ["Cash-on-cash return", fmtPct(r.cashOnCashPct)],
    ["Annual NOI", money(r.noi)], ["Debt coverage", r.loanAmount > 0 ? `${r.dscr.toFixed(2)}x` : "N/A"],
  ]);
  m.schedules("Sources & uses", [
    ["Purchase price", money(inputs.purchasePrice)],
    ["Renovation budget", money(inputs.rehab)],
    ["Closing (modeled 2%)", money(inputs.purchasePrice * 0.02)],
    ["Total initial uses", money(r.loanAmount + r.cashInvested), true],
    ["Acquisition loan", money(r.loanAmount)],
    ["Equity / invested cash", money(r.cashInvested), true],
    ["Loan / purchase price", ratio(r.loanAmount, inputs.purchasePrice)],
    ["Loan / initial uses", ratio(r.loanAmount, r.loanAmount + r.cashInvested)],
    ["Rate / amortization", `${fmtPct(inputs.ratePct)} / ${inputs.termYears} yr`],
    ["Loan maturity", "Not supplied"],
  ], "Operating profile", [
    ["Annual gross rent", money(inputs.monthlyRent * 12)],
    ["Vacancy allowance", money(r.vacancy * 12)],
    ["Property tax", money(inputs.annualPropertyTax)],
    ["Insurance", money(inputs.annualInsurance)],
    ["Management", money(r.management * 12)],
    ["Maintenance", money(r.maintenance * 12)],
    ["Capital reserve", money(r.capex * 12)],
    ["NOI (after reserves)", money(r.noi), true],
    ["Annual debt service (P&I)", money(r.monthlyPI * 12)],
    ["Annual cash flow", money(r.annualCashFlow), true],
  ]);
  m.section("Model basis");
  m.paragraph("Year-one rental underwriting. Closing costs use the existing 2% model; acquisition reserves and lease-up costs are not separately modeled. NOI follows the app convention and includes capital reserves. Amortization is not a confirmed loan maturity.", 8.5);
  m.page();
  m.text("SUPPORTING SCHEDULES", M, m.y, 17, true, NAVY);
  m.y += 24;
  m.paragraph(state.address || "Property address not supplied");
  m.schedules("Return & score detail", [
    ["Long-term score", `${r.longScore} / 100`, true],
    ["Cash-flow score", `${r.shortScore} / 100`],
    ["Cash-on-cash return", fmtPct(r.cashOnCashPct)],
    ["Cap rate (purchase basis)", fmtPct(r.capRatePct)],
    ["Year-one principal paydown", money(r.annualPrincipalPaydown)],
  ], "Operating assumptions", [
    ["Monthly underwritten rent", money(inputs.monthlyRent)],
    ["Vacancy / management", `${fmtPct(inputs.vacancyPct)} / ${fmtPct(inputs.managementPct)}`],
    ["Maintenance / capex", `${fmtPct(inputs.maintenancePct)} / ${fmtPct(inputs.capexPct)}`],
    ["Monthly PITI", money(r.piti)],
    ["Reference value (not ARV)", money(inputs.valueEstimate)],
  ]);
  m.section("Market evidence");
  m.paragraph(`Saved rental reference: low ${money(state.rentLow)} / median ${money(state.rentMedian)} / high ${money(state.rentHigh)} per month. Reported comp count: ${state.rentCompCount ?? "Not supplied"}. Data date: Not supplied. These are saved market references, not individual verified comparable leases.`);
  m.paragraph(`Property tax is ${state.annualPropertyTax == null ? "estimated unless manually overridden" : "based on the saved property-tax reference, unless manually overridden"}. Insurance is estimated unless manually overridden. This PDF uses the current effective operating inputs, including edits.`);
  disclosures(m);
  return { doc: m.finish(), filename: fileName(state.address, "Hold") };
}
