// Synthetic fixtures only. Never fetches or publishes real customer data.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultDealInputs, type Deal } from "../shared/schema";
import { DEFAULT_HOLD_STATE, toHoldInputs } from "../client/src/lib/holdState";
import { buildInstitutionalDealPdf, buildInstitutionalHoldPdf } from "../client/src/lib/lenderMemoPdf";

const out = resolve(process.argv[2] || "/tmp/propboxiq-memo-samples");
mkdirSync(out, { recursive: true });
const deal = {
  id: 0, address: "1234 Example Avenue", city: "Bowie", state: "MD", zip: "20716",
  name: "Illustrative Flip Investment", notes: JSON.stringify({
    kind: "comps", excludedCompIds: ["4"],
    compsData: { comps: [
      { id: "1", address: "100 Example Court (illustrative)", price: 510000, sqft: 2350, pricePerSqft: 217, distance: 0.4 },
      { id: "2", address: "200 Example Lane (illustrative)", price: 495000, sqft: 2300, pricePerSqft: 215, distance: 0.65 },
      { id: "3", address: "300 Example Road (illustrative)", price: 480000, sqft: 2200, pricePerSqft: 218, distance: 0.8 },
      { id: "4", address: "400 Example Drive (illustrative)", price: 550000, sqft: 3000, pricePerSqft: 183, distance: 1.5 },
    ] },
  }),
} as Deal;
const flip = {
  ...defaultDealInputs, purchasePrice: 285000, arv: 495000, rehabBudget: 60000,
  holdingMonths: 6, sourcesUsesOverrides: { financing: 22000, holding: 4800 },
};
const holdState = {
  ...DEFAULT_HOLD_STATE, address: "Illustrative Rental / 1234 Example Avenue", zip: "20716",
  purchasePrice: 300000, rehabEnabled: true, rehab: 18000, monthlyRent: 3200,
  rentLow: 2800, rentMedian: 3100, rentHigh: 3400, rentCompCount: 8,
};
const samples = [
  ["PropBoxIQ_Flip_Lender_Memo.pdf", buildInstitutionalDealPdf(deal, flip)],
  ["PropBoxIQ_Hold_Lender_Memo.pdf", buildInstitutionalHoldPdf(holdState, toHoldInputs(holdState))],
] as const;
for (const [filename, { doc }] of samples) {
  doc.setProperties({ author: "Perplexity Computer", subject: "Illustrative sample only. Not an actual property or investment recommendation." });
  writeFileSync(resolve(out, filename), Buffer.from(doc.output("arraybuffer")));
  console.log(`${filename}: ${doc.getNumberOfPages()} pages`);
}
