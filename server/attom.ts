// ATTOM Data Solutions client.
// Surfaces ownership, deed/sale history, mortgages, and distress (pre-foreclosure /
// NOD / lis pendens / auction / REO) signals to complement RentCast's listing/AVM
// data. ATTOM uses an `apikey` header and address1/address2 params on most calls.
//
// Cost-aware: each app endpoint that touches ATTOM is cached server-side with
// generous TTLs. Distress status changes faster than ownership, so it gets a
// shorter TTL.
//
// Key handling: when ATTOM_API_KEY is missing the module returns a typed
// `KeyMissingError` instead of crashing. The HTTP layer turns that into a 503
// with a clear message so the deploy stays healthy until the user provisions
// a key.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ATTOM_BASE = "https://api.gateway.attomdata.com";

// Endpoints we call. Documenting them here doubles as a reference card for the
// product team — these are the per-call cost centers in the integration.
export const ATTOM_ENDPOINTS = {
  propertyDetail: "/propertyapi/v1.0.0/property/detail",
  propertyExpandedProfile: "/propertyapi/v1.0.0/property/expandedprofile",
  salesHistory: "/propertyapi/v1.0.0/saleshistory/detail",
  foreclosureSnapshot: "/propertyapi/v4/property/snapshot",
  // v4 detail also surfaces foreclosure-status flags on some plans
  v4PropertyDetail: "/propertyapi/v4/property/detail",
} as const;

export class KeyMissingError extends Error {
  constructor() {
    super("ATTOM_API_KEY is not configured");
    this.name = "KeyMissingError";
  }
}

export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

// ----- Cache -----
// Parallel sqlite cache so we don't share the deals DB connection. Stored at
// $DATA_DIR/attom_cache.db on Render, falls back to ./attom_cache.db locally.
// Two TTL classes: long for ownership/sale history, short for distress.

const DATA_DIR = process.env.DATA_DIR || ".";
mkdirSync(DATA_DIR, { recursive: true });
const CACHE_PATH = path.join(DATA_DIR, "attom_cache.db");
const cacheDb = new Database(CACHE_PATH);
cacheDb.pragma("journal_mode = WAL");
cacheDb.exec(`
  CREATE TABLE IF NOT EXISTS attom_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attom_cache_expires ON attom_cache(expires_at);
`);

const TTL_LONG_MS = 24 * 60 * 60 * 1000; // 24h — owner / sale history / mortgage
const TTL_SHORT_MS = 6 * 60 * 60 * 1000; //  6h — distress / foreclosure flags

function cacheGet(key: string): unknown | null {
  const row = cacheDb
    .prepare("SELECT payload, expires_at FROM attom_cache WHERE cache_key = ?")
    .get(key) as { payload: string; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    cacheDb.prepare("DELETE FROM attom_cache WHERE cache_key = ?").run(key);
    return null;
  }
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function cacheSet(key: string, payload: unknown, ttlMs: number): void {
  cacheDb
    .prepare(
      "INSERT OR REPLACE INTO attom_cache (cache_key, payload, expires_at) VALUES (?, ?, ?)"
    )
    .run(key, JSON.stringify(payload), Date.now() + ttlMs);
}

// ----- Address parsing -----
// ATTOM expects the address split into street (address1) and "City, State ZIP"
// (address2). Most callers pass a single `formattedAddress` string, so we split
// on the first comma. If the input doesn't have the expected shape we still pass
// it through as address1 and let ATTOM fail loudly.
export function splitAddress(formatted: string): { address1: string; address2: string } {
  const trimmed = formatted.trim().replace(/,\s*USA$/i, "");
  const idx = trimmed.indexOf(",");
  if (idx === -1) {
    return { address1: trimmed, address2: "" };
  }
  return {
    address1: trimmed.slice(0, idx).trim(),
    address2: trimmed.slice(idx + 1).trim(),
  };
}

// ----- Low-level fetch with retry -----
// Mirrors the shape called for in the brief: 401 → throw 503-typed; 429 →
// retry once → 503-typed; 5xx → retry once → 503-typed. We don't retry on
// 4xx-other since those are address/parameter problems, not transient.
async function callAttom<T = any>(endpoint: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.ATTOM_API_KEY;
  if (!apiKey) throw new KeyMissingError();

  const url = `${ATTOM_BASE}${endpoint}?${new URLSearchParams(params).toString()}`;

  const attempt = async (): Promise<Response> =>
    fetch(url, {
      headers: {
        apikey: apiKey,
        Accept: "application/json",
        "User-Agent": "PropBoxIQ/1.0 (real estate deal analyzer)",
      },
    });

  let res = await attempt();

  // Retry once on 429 / 5xx after a short backoff.
  if (res.status === 429 || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 600));
    res = await attempt();
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new UpstreamError("ATTOM authentication failed (check ATTOM_API_KEY)", 503);
    }
    if (res.status === 429) {
      throw new UpstreamError("ATTOM rate limit reached", 503);
    }
    if (res.status >= 500) {
      throw new UpstreamError(`ATTOM upstream error ${res.status}`, 503);
    }
    if (res.status === 404) {
      // Common, non-fatal — caller should treat as "no data".
      throw new UpstreamError("ATTOM has no record for this address", 404);
    }
    throw new UpstreamError(`ATTOM error ${res.status}`, 502);
  }

  return (await res.json()) as T;
}

// ----- Public types -----
export type DistressStatus =
  | "preforeclosure"
  | "lis_pendens"
  | "nod"
  | "auction"
  | "reo"
  | "none";

export interface DistressResult {
  status: DistressStatus;
  details: {
    recordingDate?: string | null;
    auctionDate?: string | null;
    caseNumber?: string | null;
    defaultAmount?: number | null;
    raw?: unknown;
  };
}

export interface OwnershipResult {
  owner: {
    names: string[];
    mailingAddress: string | null;
    absentee: boolean | null;
    ownerOccupied: boolean | null;
  } | null;
  lastSale: {
    date: string | null;
    price: number | null;
    grantor: string | null;
    grantee: string | null;
  } | null;
  saleHistory: Array<{
    date: string | null;
    price: number | null;
    grantor: string | null;
    grantee: string | null;
  }>;
  mortgage: {
    lender: string | null;
    originalAmount: number | null;
    recordingDate: string | null;
  } | null;
}

// ----- High-level methods -----
// Each public method below is cache-fronted. Cache miss → ATTOM call → write-back.
// Errors propagate up; the route layer maps them to HTTP responses.

export async function getDistress(formattedAddress: string): Promise<DistressResult> {
  const key = `distress:${formattedAddress.toLowerCase()}`;
  const cached = cacheGet(key) as DistressResult | null;
  if (cached) return cached;

  const { address1, address2 } = splitAddress(formattedAddress);
  // Try v4 property snapshot first — it includes foreclosure flags on most
  // ATTOM tiers. Fall back to v4 property/detail if snapshot 404s.
  let data: any = null;
  try {
    data = await callAttom<any>(ATTOM_ENDPOINTS.foreclosureSnapshot, {
      address1,
      address2,
    });
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) {
      try {
        data = await callAttom<any>(ATTOM_ENDPOINTS.v4PropertyDetail, {
          address1,
          address2,
        });
      } catch (e2) {
        if (e2 instanceof UpstreamError && e2.status === 404) {
          const empty: DistressResult = { status: "none", details: {} };
          cacheSet(key, empty, TTL_SHORT_MS);
          return empty;
        }
        throw e2;
      }
    } else {
      throw e;
    }
  }

  const property = Array.isArray(data?.property) ? data.property[0] : data?.property;
  const fc = property?.foreclosure ?? property?.foreclosureinfo ?? null;
  const result: DistressResult = parseDistress(fc);
  cacheSet(key, result, TTL_SHORT_MS);
  return result;
}

function parseDistress(fc: any): DistressResult {
  if (!fc || typeof fc !== "object") {
    return { status: "none", details: {} };
  }

  // ATTOM uses several free-text status fields. We map common values to our
  // canonical 6-bucket enum. Unknown / blank → "none".
  const rawStatus = String(
    fc.status ?? fc.foreclosureStatus ?? fc.fclType ?? fc.fclStatus ?? ""
  ).toLowerCase();

  let status: DistressStatus = "none";
  if (/reo|bank.?owned/.test(rawStatus)) status = "reo";
  else if (/auction|trustee.?sale|sheriff/.test(rawStatus)) status = "auction";
  else if (/lis.?pendens/.test(rawStatus)) status = "lis_pendens";
  else if (/notice.?of.?default|\bnod\b/.test(rawStatus)) status = "nod";
  else if (/pre.?foreclosure|preforeclosure/.test(rawStatus)) status = "preforeclosure";

  return {
    status,
    details: {
      recordingDate: fc.recordingDate ?? fc.recordingdate ?? null,
      auctionDate: fc.auctionDate ?? fc.auctiondate ?? null,
      caseNumber: fc.caseNumber ?? fc.casenumber ?? null,
      defaultAmount:
        typeof fc.defaultAmount === "number"
          ? fc.defaultAmount
          : typeof fc.defaultamount === "number"
            ? fc.defaultamount
            : null,
      raw: fc,
    },
  };
}

export async function getOwnership(formattedAddress: string): Promise<OwnershipResult> {
  const key = `ownership:${formattedAddress.toLowerCase()}`;
  const cached = cacheGet(key) as OwnershipResult | null;
  if (cached) return cached;

  const { address1, address2 } = splitAddress(formattedAddress);

  // expandedprofile gives owner + most-recent sale; saleshistory/detail gives
  // the full chain plus mortgage/lien records. Run them in parallel.
  const [profile, history] = await Promise.all([
    callAttom<any>(ATTOM_ENDPOINTS.propertyExpandedProfile, {
      address1,
      address2,
    }).catch((e) => {
      if (e instanceof UpstreamError && e.status === 404) return null;
      throw e;
    }),
    callAttom<any>(ATTOM_ENDPOINTS.salesHistory, {
      address1,
      address2,
    }).catch((e) => {
      if (e instanceof UpstreamError && e.status === 404) return null;
      throw e;
    }),
  ]);

  const result = parseOwnership(profile, history);
  cacheSet(key, result, TTL_LONG_MS);
  return result;
}

function parseOwnership(profile: any, history: any): OwnershipResult {
  const prop = Array.isArray(profile?.property) ? profile.property[0] : profile?.property;
  const ownerRaw = prop?.owner ?? null;

  const names: string[] = [];
  if (ownerRaw) {
    // ATTOM returns owner1.fullname / owner2.fullname (and a few variants).
    for (const k of ["owner1", "owner2", "owner3", "owner4"]) {
      const o = ownerRaw[k];
      if (o?.fullname) names.push(String(o.fullname));
      else if (o?.firstnameandmi || o?.lastname) {
        const composed = [o.firstnameandmi, o.lastname].filter(Boolean).join(" ");
        if (composed) names.push(composed);
      }
    }
  }

  // Mailing address — owner mail address block on the property record.
  const mail = prop?.address?.mailingaddress ?? prop?.owner?.mailingaddressoneline ?? null;
  const subjectAddress = prop?.address?.oneLine ?? prop?.address?.line1 ?? null;
  const mailingAddress =
    typeof mail === "string"
      ? mail
      : mail?.oneLine ?? mail?.line1 ?? null;
  const absentee =
    mailingAddress && subjectAddress
      ? String(mailingAddress).trim().toLowerCase() !==
        String(subjectAddress).trim().toLowerCase()
      : null;
  const ownerOccupied = absentee == null ? null : !absentee;

  // Sale history — saleshistory/detail returns property[0].salehistory[]
  const histProp = Array.isArray(history?.property) ? history.property[0] : history?.property;
  const sales: any[] = Array.isArray(histProp?.salehistory) ? histProp.salehistory : [];
  const saleHistory = sales
    .map((s) => ({
      date: s?.amount?.salerecdate ?? s?.saletranshistory?.salerecdate ?? s?.salerecdate ?? null,
      price:
        Number(s?.amount?.saleamt ?? s?.saletranshistory?.saleamt ?? s?.saleamt) || null,
      grantor: s?.grantor?.lastname ?? s?.saletranshistory?.grantor1 ?? null,
      grantee: s?.grantee?.lastname ?? s?.saletranshistory?.grantee1 ?? null,
    }))
    .filter((s) => s.date || s.price);
  saleHistory.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

  const lastSale = saleHistory[0] ?? null;

  // Mortgage — mortgageorigination block on the most recent sale, or a top-level
  // mortgageinfo block. ATTOM tiers vary; we take whatever is present.
  let mortgage: OwnershipResult["mortgage"] = null;
  const mortRaw =
    sales[0]?.mortgage ??
    histProp?.mortgageorigination ??
    prop?.mortgageorigination ??
    null;
  if (mortRaw) {
    mortgage = {
      lender: mortRaw.lender ?? mortRaw.lendername ?? null,
      originalAmount:
        Number(mortRaw.amount ?? mortRaw.mortgageamt ?? mortRaw.originalamt) || null,
      recordingDate: mortRaw.recordingDate ?? mortRaw.recordingdate ?? null,
    };
  }

  return {
    owner: ownerRaw
      ? {
          names: Array.from(new Set(names)).filter(Boolean),
          mailingAddress,
          absentee,
          ownerOccupied,
        }
      : null,
    lastSale,
    saleHistory: saleHistory.slice(0, 10),
    mortgage,
  };
}
