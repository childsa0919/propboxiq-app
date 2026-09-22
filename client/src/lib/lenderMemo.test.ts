import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { defaultDealInputs, type Deal } from "../../../shared/schema";
import { calculateDeal, fmtUSD } from "./calc";
import { calculateHold } from "./holdCalc";
import { DEFAULT_HOLD_STATE, toHoldInputs } from "./holdState";
import * as exporter from "./exportPdf";

const deal = {
  id: 1, name: null, address: "1234 Example Avenue", city: "Bowie",
  state: "MD", zip: "20716", notes: null,
} as Deal;
const inputs = {
  ...defaultDealInputs, purchasePrice: 300000, arv: 480000, rehabBudget: 60000,
  sourcesUsesOverrides: { financing: 22000, holding: 4800 },
};

async function pdfText(result: { blob: Blob }) {
  const dir = mkdtempSync(join(tmpdir(), "lender-memo-"));
  try {
    const file = join(dir, "memo.pdf");
    writeFileSync(file, Buffer.from(await result.blob.arrayBuffer()));
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("Flip PDF uses the institutional lender memo and actual display calculations", async () => {
  const result = await exporter.exportDealPdfBlob(deal, inputs);
  const text = await pdfText(result);
  assert.match(text, /PRIVATE EQUITY UNDERWRITING/);
  assert.match(text, /CONFIDENTIAL UNDERWRITING/);
  assert.match(text, /PROPBOXIQ UNDERWRITING SCORE/);
  assert.match(text, /SOURCES & USES/);
  assert.match(text, /ASSUMPTIONS & RISK/);
  const r = calculateDeal(inputs, { state: deal.state, city: deal.city });
  assert.ok(text.includes(fmtUSD(r.netProfit)), "profit matches the locale-aware results screen");
  assert.ok(text.includes(fmtUSD(r.totalFinancingCost)), "manual financing override is preserved");
  assert.ok(text.includes(fmtUSD(r.totalProjectCost)), "total cost is preserved");
  assert.equal(result.base64, Buffer.from(await result.blob.arrayBuffer()).toString("base64"));
  assert.match(result.filename, /^PropBoxIQ_.*\.pdf$/);
});

test("Hold PDF exports the edited inputs and both existing scores without inventing market evidence", async () => {
  assert.equal(typeof exporter.exportHoldPdfBlob, "function", "Hold needs the matching PDF exporter");
  const state = { ...DEFAULT_HOLD_STATE, address: deal.address, purchasePrice: 300000, monthlyRent: 3200 };
  const holdInputs = { ...toHoldInputs(state), managementPct: 10, annualInsurance: 2100 };
  const r = calculateHold(holdInputs);
  const result = await exporter.exportHoldPdfBlob(state, holdInputs);
  const text = await pdfText(result);
  assert.match(text, /PRIVATE EQUITY UNDERWRITING/);
  assert.match(text, /HOLD \/ RENTAL/);
  assert.match(text, /OPERATING PROFILE/);
  assert.match(text, /Long-term score/);
  assert.match(text, /Cash-flow score/);
  assert.ok(text.includes(`${r.longScore} / 100`));
  assert.ok(text.includes(fmtUSD(r.monthlyCashFlow)));
  assert.ok(text.includes(fmtUSD(r.monthlyPI * 12)));
  assert.match(text, /Not supplied/);
});

test("Long notes paginate before the footer and preserve the last line", async () => {
  const notes = Array.from({ length: 120 }, (_, n) => `Note ${n + 1}: Verify scope, title and final financing.`).join("\n");
  const text = await pdfText(await exporter.exportDealPdfBlob({ ...deal, notes }, inputs));
  const pages = text.split("\f").filter(p => p.trim());
  assert.ok(pages.length >= 4, "notes must paginate, not overflow one page");
  for (const page of pages) {
    assert.match(page, /CONFIDENTIAL UNDERWRITING/);
    assert.match(page, /Page \d+ of \d+/);
  }
  assert.match(text, /Note 120:/);
});

test("Missing and excluded comps are represented honestly", async () => {
  const notes = JSON.stringify({
    kind: "comps", excludedCompIds: ["excluded"],
    compsData: { comps: [
      { id: "included", address: "101 Selected Street", price: 470000, sqft: 2000, pricePerSqft: 235 },
      { id: "excluded", address: "102 Excluded Street", price: 520000, sqft: 2100 },
    ] },
  });
  const text = await pdfText(await exporter.exportDealPdfBlob({ ...deal, notes }, inputs));
  assert.match(text, /101 Selected Street/);
  assert.match(text, /102 Excluded Street/);
  assert.match(text, /EXCLUDED BY INVESTOR/);
  assert.doesNotMatch(text, /compsData|excludedCompIds|NaN|undefined/);
});

test("Cash purchases and negative returns are not presented as debt-financed or approved", async () => {
  const cash = { ...inputs, isCashPurchase: true, sourcesUsesOverrides: undefined, arv: 280000 };
  const text = await pdfText(await exporter.exportDealPdfBlob(deal, cash));
  assert.match(text, /ALL CASH/);
  assert.match(text, /ELEVATED RISK/);
  assert.doesNotMatch(text, /PROCEED SUBJECT/);
  const state = { ...DEFAULT_HOLD_STATE, address: deal.address, purchasePrice: 300000, monthlyRent: 3200, downPct: 100 };
  const hold = await pdfText(await exporter.exportHoldPdfBlob(state, toHoldInputs(state)));
  assert.match(hold, /No acquisition debt is modeled/);
  assert.match(hold, /N\/A/);
});

test("Comparison PDF still exports after replacing the single-deal renderer", async () => {
  const result = await exporter.exportComparePdfBlob([{ deal, inputs }, { deal: { ...deal, id: 2, address: "Second Example" }, inputs }]);
  assert.ok(result);
  const text = await pdfText(result);
  assert.match(text, /Second Example/);
  assert.match(text, /1234 Example Avenue/);
});
