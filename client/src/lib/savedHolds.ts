// Locally-persisted Hold deals. Flip deals live server-side (/api/deals); Hold
// deals are saved to localStorage by the Hold result page. This module is the
// single reader/writer so the Deals list and result page stay in sync.

import {
  DEFAULT_HOLD_STATE,
  type HoldWizardState,
  encodeHoldState,
} from "@/lib/holdState";

export const SAVED_HOLDS_KEY = "propboxiq:savedHolds";

// User edits to the operating-expense mix, as decimal shares of total monthly
// OpEx (e.g. 0.012 = 1.2%). Only the non-PITI rows are editable. Absent keys
// fall back to the documented defaults; an absent object means no edits.
export interface OpExOverrides {
  propTax?: number;
  insurance?: number;
  vacancy?: number;
  mgmt?: number;
  maint?: number;
  capex?: number;
}

export interface SavedHold {
  dealType: "hold";
  savedAt: string; // ISO timestamp
  address: string;
  zip: string | null;
  longScore: number;
  shortScore: number;
  monthlyCashFlow: number;
  state: HoldWizardState;
  opExOverrides?: OpExOverrides;
}

function isSavedHold(v: unknown): v is SavedHold {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.savedAt === "string" &&
    typeof o.address === "string" &&
    typeof o.longScore === "number" &&
    typeof o.shortScore === "number" &&
    typeof o.monthlyCashFlow === "number" &&
    typeof o.state === "object" &&
    o.state !== null
  );
}

/** Read all saved hold deals, newest first. Tolerates malformed storage. */
export function readSavedHolds(): SavedHold[] {
  try {
    const raw = localStorage.getItem(SAVED_HOLDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedHold).map((h) => ({
      dealType: "hold",
      savedAt: h.savedAt,
      address: h.address,
      zip: h.zip ?? null,
      longScore: h.longScore,
      shortScore: h.shortScore,
      monthlyCashFlow: h.monthlyCashFlow,
      state: { ...DEFAULT_HOLD_STATE, ...h.state },
      ...(h.opExOverrides ? { opExOverrides: h.opExOverrides } : {}),
    }));
  } catch {
    return [];
  }
}

/** Remove a saved hold by its savedAt timestamp (used as the stable id). */
export function removeSavedHold(savedAt: string): void {
  try {
    const list = readSavedHolds().filter((h) => h.savedAt !== savedAt);
    localStorage.setItem(SAVED_HOLDS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable — nothing to do
  }
}

/** Path to the result page for a saved hold, re-using the encoded-state mechanism. */
export function holdResultPath(h: SavedHold): string {
  return `/hold/result?${encodeHoldState(h.state)}`;
}
