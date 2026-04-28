// Locale-aware closing-cost engine.
// Given a state code, purchase price, ARV, and loan amount, returns itemized
// line items for both the BUY (acquisition) and SELL (disposition) sides of a
// flip. Data sourced from state revenue sites, ALTA, FNTIC NCS customs guide,
// LANDCAN/NAR transfer-tax chart, and Bankrate state guides (April 2026).
//
// Numbers are pragmatic averages — locale customs vary by county/municipality
// (Chicago, NYC, MD counties, FL counties). Special cases for FL (three-tax
// rule), NYC (mortgage recording tax), and PA (bundled premium) are handled
// inline.

export interface LineItem {
  label: string;
  amount: number;
  note?: string;
}

export interface ClosingCostBreakdown {
  buy: { items: LineItem[]; total: number };
  sell: { items: LineItem[]; total: number };
  sourceState: string;
  stateName: string;
}

interface StateData {
  name: string;
  // Transfer / recordation tax — % of price
  transferTaxPct: number;
  transferPayer: "buyer" | "seller" | "split" | "none";
  // Owner's title insurance — % of price (typically paid on sale by seller customarily,
  // but we apply the local custom: most states the BUYER buys owner's policy on purchase;
  // states like CA (N), FL, OH, MN — seller pays; we encode via `ownersTitlePayer`).
  ownersTitlePct: number;
  ownersTitlePayer: "buyer" | "seller" | "split";
  // Lender's title — flat $ when financed
  lendersTitleFlat: number;
  // Settlement / closing / attorney fee per side ($, midpoint)
  settlementFee: number;
  // Combined deed + mortgage recording fees ($)
  recordingFee: number;
}

// Compact lookup table sourced from the research CSV. Sale-side reflects local
// payer customs; buy-side reflects buyer's typical line items.
const STATES: Record<string, StateData> = {
  AL: { name: "Alabama", transferTaxPct: 0.10, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 500, recordingFee: 50 },
  AK: { name: "Alaska", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 75 },
  AZ: { name: "Arizona", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.60, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 40 },
  AR: { name: "Arkansas", transferTaxPct: 0.33, transferPayer: "split", ownersTitlePct: 0.45, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 500, recordingFee: 100 },
  CA: { name: "California", transferTaxPct: 0.11, transferPayer: "seller", ownersTitlePct: 0.52, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 175 },
  CO: { name: "Colorado", transferTaxPct: 0.01, transferPayer: "buyer", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 100 },
  CT: { name: "Connecticut", transferTaxPct: 0.75, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 900, recordingFee: 75 },
  DE: { name: "Delaware", transferTaxPct: 4.00, transferPayer: "split", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 200, settlementFee: 800, recordingFee: 100 },
  DC: { name: "District of Columbia", transferTaxPct: 2.20, transferPayer: "split", ownersTitlePct: 0.45, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 800, recordingFee: 150 },
  FL: { name: "Florida", transferTaxPct: 0.70, transferPayer: "seller", ownersTitlePct: 0.525, ownersTitlePayer: "seller", lendersTitleFlat: 25, settlementFee: 700, recordingFee: 100 },
  GA: { name: "Georgia", transferTaxPct: 0.10, transferPayer: "buyer", ownersTitlePct: 0.60, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 40 },
  HI: { name: "Hawaii", transferTaxPct: 0.10, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 100 },
  ID: { name: "Idaho", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.50, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 500, recordingFee: 75 },
  IL: { name: "Illinois", transferTaxPct: 0.15, transferPayer: "seller", ownersTitlePct: 0.45, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 100 },
  IN: { name: "Indiana", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.45, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 500, recordingFee: 75 },
  IA: { name: "Iowa", transferTaxPct: 0.16, transferPayer: "seller", ownersTitlePct: 0.40, ownersTitlePayer: "seller", lendersTitleFlat: 175, settlementFee: 500, recordingFee: 75 },
  KS: { name: "Kansas", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.50, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 100 },
  KY: { name: "Kentucky", transferTaxPct: 0.10, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 85 },
  LA: { name: "Louisiana", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.45, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 100 },
  ME: { name: "Maine", transferTaxPct: 0.44, transferPayer: "split", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 75 },
  MD: { name: "Maryland", transferTaxPct: 1.20, transferPayer: "split", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 125 },
  MA: { name: "Massachusetts", transferTaxPct: 0.456, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 900, recordingFee: 100 },
  MI: { name: "Michigan", transferTaxPct: 0.86, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 100 },
  MN: { name: "Minnesota", transferTaxPct: 0.33, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 75 },
  MS: { name: "Mississippi", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.45, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 75 },
  MO: { name: "Missouri", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.35, ownersTitlePayer: "seller", lendersTitleFlat: 175, settlementFee: 500, recordingFee: 50 },
  MT: { name: "Montana", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.50, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 75 },
  NE: { name: "Nebraska", transferTaxPct: 0.175, transferPayer: "seller", ownersTitlePct: 0.45, ownersTitlePayer: "split", lendersTitleFlat: 200, settlementFee: 500, recordingFee: 75 },
  NV: { name: "Nevada", transferTaxPct: 0.51, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 100 },
  NH: { name: "New Hampshire", transferTaxPct: 1.50, transferPayer: "split", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 200, settlementFee: 700, recordingFee: 75 },
  NJ: { name: "New Jersey", transferTaxPct: 0.96, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 800, recordingFee: 100 },
  NM: { name: "New Mexico", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 75 },
  NY: { name: "New York", transferTaxPct: 0.40, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 900, recordingFee: 200 },
  NC: { name: "North Carolina", transferTaxPct: 0.20, transferPayer: "seller", ownersTitlePct: 0.17, ownersTitlePayer: "buyer", lendersTitleFlat: 29, settlementFee: 700, recordingFee: 90 },
  ND: { name: "North Dakota", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.40, ownersTitlePayer: "buyer", lendersTitleFlat: 200, settlementFee: 500, recordingFee: 65 },
  OH: { name: "Ohio", transferTaxPct: 0.40, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 75 },
  OK: { name: "Oklahoma", transferTaxPct: 0.15, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 75 },
  OR: { name: "Oregon", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.50, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 100 },
  PA: { name: "Pennsylvania", transferTaxPct: 2.00, transferPayer: "split", ownersTitlePct: 0.70, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 800, recordingFee: 150 },
  RI: { name: "Rhode Island", transferTaxPct: 0.75, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 75 },
  SC: { name: "South Carolina", transferTaxPct: 0.37, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 75 },
  SD: { name: "South Dakota", transferTaxPct: 0.10, transferPayer: "seller", ownersTitlePct: 0.40, ownersTitlePayer: "split", lendersTitleFlat: 200, settlementFee: 500, recordingFee: 75 },
  TN: { name: "Tennessee", transferTaxPct: 0.37, transferPayer: "buyer", ownersTitlePct: 0.45, ownersTitlePayer: "seller", lendersTitleFlat: 200, settlementFee: 600, recordingFee: 75 },
  TX: { name: "Texas", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.589, ownersTitlePayer: "seller", lendersTitleFlat: 100, settlementFee: 600, recordingFee: 100 },
  UT: { name: "Utah", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.625, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 75 },
  VT: { name: "Vermont", transferTaxPct: 1.45, transferPayer: "buyer", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 800, recordingFee: 75 },
  VA: { name: "Virginia", transferTaxPct: 0.25, transferPayer: "seller", ownersTitlePct: 0.45, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 100 },
  WA: { name: "Washington", transferTaxPct: 1.10, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 610 },
  WV: { name: "West Virginia", transferTaxPct: 0.33, transferPayer: "seller", ownersTitlePct: 0.50, ownersTitlePayer: "buyer", lendersTitleFlat: 250, settlementFee: 700, recordingFee: 75 },
  WI: { name: "Wisconsin", transferTaxPct: 0.30, transferPayer: "seller", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 75 },
  WY: { name: "Wyoming", transferTaxPct: 0.00, transferPayer: "none", ownersTitlePct: 0.55, ownersTitlePayer: "seller", lendersTitleFlat: 250, settlementFee: 600, recordingFee: 75 },
};

// US-average fallback for unknown states.
const US_AVG: StateData = {
  name: "U.S. average",
  transferTaxPct: 0.40,
  transferPayer: "seller",
  ownersTitlePct: 0.50,
  ownersTitlePayer: "buyer",
  lendersTitleFlat: 250,
  settlementFee: 700,
  recordingFee: 125,
};

// Lookup by 2-letter state code OR full state name (case-insensitive).
export function lookupState(input?: string | null): { code: string; data: StateData } {
  if (!input) return { code: "US", data: US_AVG };
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (STATES[upper]) return { code: upper, data: STATES[upper] };
  // Try full-name match
  const match = Object.entries(STATES).find(
    ([, v]) => v.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return { code: match[0], data: match[1] };
  return { code: "US", data: US_AVG };
}

export function computeClosingCosts(
  stateInput: string | null | undefined,
  purchasePrice: number,
  arv: number,
  loanAmount: number,
  cityHint?: string | null
): ClosingCostBreakdown {
  const { code, data } = lookupState(stateInput);
  const isNYC = code === "NY" && /new york|nyc|manhattan|bronx|brooklyn|queens|staten/i.test(cityHint || "");
  const isChicago = code === "IL" && /chicago/i.test(cityHint || "");
  const isFL = code === "FL";

  // ---- BUY side (acquisition) ----
  const buyItems: LineItem[] = [];

  // Transfer / recordation tax — only when buyer pays or split
  const transferTaxBase = purchasePrice * (data.transferTaxPct / 100);
  if (data.transferPayer === "buyer") {
    buyItems.push({
      label: "Transfer tax",
      amount: transferTaxBase,
      note: `${data.transferTaxPct}% of price (buyer pays in ${data.name})`,
    });
  } else if (data.transferPayer === "split") {
    buyItems.push({
      label: "Transfer tax (buyer half)",
      amount: transferTaxBase / 2,
      note: `${data.transferTaxPct}% split 50/50`,
    });
  }
  // Chicago: buyer pays 0.75% city transfer tax on top
  if (isChicago) {
    buyItems.push({
      label: "Chicago transfer tax",
      amount: purchasePrice * 0.0075,
      note: "0.75% city transfer tax (buyer)",
    });
  }

  // Owner's title insurance — if buyer customarily pays
  if (data.ownersTitlePayer === "buyer") {
    buyItems.push({
      label: "Owner's title insurance",
      amount: purchasePrice * (data.ownersTitlePct / 100),
      note: `~${data.ownersTitlePct}% of price`,
    });
  } else if (data.ownersTitlePayer === "split") {
    buyItems.push({
      label: "Owner's title (buyer half)",
      amount: (purchasePrice * (data.ownersTitlePct / 100)) / 2,
    });
  }

  // Lender's title insurance — only when financed
  if (loanAmount > 0) {
    buyItems.push({
      label: "Lender's title insurance",
      amount: data.lendersTitleFlat,
      note: "Simultaneous-issue rate",
    });
  }

  // Settlement / closing / attorney fee
  buyItems.push({
    label: "Settlement / closing fee",
    amount: data.settlementFee,
    note: "Attorney or escrow fee",
  });

  // Recording fees (deed + mortgage if financed)
  buyItems.push({
    label: "Recording fees",
    amount: data.recordingFee,
    note: loanAmount > 0 ? "Deed + mortgage recording" : "Deed recording",
  });

  // Lender origination + appraisal + survey/inspection/prepaids — only when financed
  if (loanAmount > 0) {
    buyItems.push({
      label: "Lender origination fee",
      amount: loanAmount * 0.01,
      note: "~1% of loan",
    });
    buyItems.push({
      label: "Appraisal",
      amount: 600,
      note: "Typical residential appraisal",
    });
    buyItems.push({
      label: "Survey / inspection",
      amount: 700,
      note: "Survey + general inspection",
    });
    buyItems.push({
      label: "Prepaid taxes & insurance",
      amount: Math.round(purchasePrice * 0.005),
      note: "~6 months escrow reserves",
    });
  }

  // Florida special: note doc stamps + intangible tax on the loan (buyer pays)
  if (isFL && loanAmount > 0) {
    buyItems.push({
      label: "FL note doc stamps",
      amount: loanAmount * 0.0035,
      note: "0.35% of loan amount",
    });
    buyItems.push({
      label: "FL intangible tax",
      amount: loanAmount * 0.002,
      note: "0.20% of loan amount",
    });
  }

  // NYC mortgage recording tax (largest single line item for NYC flips)
  if (isNYC && loanAmount > 0) {
    buyItems.push({
      label: "NYC mortgage recording tax",
      amount: loanAmount * 0.018,
      note: "1.80% of loan (NYC)",
    });
  }

  // ---- SELL side (disposition) ----
  const sellItems: LineItem[] = [];

  const transferTaxArv = arv * (data.transferTaxPct / 100);
  if (data.transferPayer === "seller") {
    sellItems.push({
      label: "Transfer tax",
      amount: transferTaxArv,
      note: `${data.transferTaxPct}% of sale price`,
    });
  } else if (data.transferPayer === "split") {
    sellItems.push({
      label: "Transfer tax (seller half)",
      amount: transferTaxArv / 2,
      note: `${data.transferTaxPct}% split 50/50`,
    });
  }

  if (data.ownersTitlePayer === "seller") {
    sellItems.push({
      label: "Owner's title insurance",
      amount: arv * (data.ownersTitlePct / 100),
      note: `~${data.ownersTitlePct}% of sale price`,
    });
  } else if (data.ownersTitlePayer === "split") {
    sellItems.push({
      label: "Owner's title (seller half)",
      amount: (arv * (data.ownersTitlePct / 100)) / 2,
    });
  }

  sellItems.push({
    label: "Settlement / closing fee",
    amount: data.settlementFee,
    note: "Seller-side closing fee",
  });

  sellItems.push({
    label: "Recording fees",
    amount: Math.round(data.recordingFee * 0.4),
    note: "Deed + payoff recording",
  });

  // Round and total
  for (const item of buyItems) item.amount = Math.round(item.amount);
  for (const item of sellItems) item.amount = Math.round(item.amount);

  const buyTotal = buyItems.reduce((s, i) => s + i.amount, 0);
  const sellTotal = sellItems.reduce((s, i) => s + i.amount, 0);

  return {
    buy: { items: buyItems, total: buyTotal },
    sell: { items: sellItems, total: sellTotal },
    sourceState: code,
    stateName: data.name,
  };
}
