// RentCast API client — wraps every upstream call with:
//   • a SQLite-backed response cache keyed on `{endpoint}|{normalized_params}`
//   • typed error classes for 401 / 429 / 5xx so callers can map to user-facing 503s
//   • a single retry on 429 (1s) and 5xx (500ms)
//
// Routes should never call `fetch` directly — go through `getOrFetch` so the
// cache is honored and errors stay typed.

import { createHash } from "node:crypto";
import { rentcastCache } from "@shared/schema";
import { db } from "./storage";
import { and, eq, gt, lt } from "drizzle-orm";

const BASE = "https://api.rentcast.io";

// Endpoint identifiers used as the first segment of `cache_key` and as the
// `endpoint` column value. Keep these short and stable — they are the cache
// partition.
export type RentcastEndpoint =
  | "properties"
  | "avm/value"
  | "avm/rent/long-term"
  | "listings/sale"
  | "listings/rental/long-term"
  | "markets";

// Default TTLs (seconds). Listings churn faster than property records or AVMs.
export const TTL_SECONDS: Record<RentcastEndpoint, number> = {
  properties: 24 * 60 * 60,
  "avm/value": 24 * 60 * 60,
  "avm/rent/long-term": 24 * 60 * 60,
  "listings/sale": 6 * 60 * 60,
  "listings/rental/long-term": 6 * 60 * 60,
  markets: 24 * 60 * 60,
};

export class RentCastAuthError extends Error {
  status = 401 as const;
  constructor(message = "RentCast auth failed (401)") {
    super(message);
    this.name = "RentCastAuthError";
  }
}

export class RentCastRateLimitError extends Error {
  status = 429 as const;
  constructor(message = "RentCast rate-limited (429)") {
    super(message);
    this.name = "RentCastRateLimitError";
  }
}

export class RentCastUpstreamError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message ?? `RentCast upstream error (${status})`);
    this.status = status;
    this.name = "RentCastUpstreamError";
  }
}

export function isRentcastTypedError(
  e: unknown,
): e is RentCastAuthError | RentCastRateLimitError | RentCastUpstreamError {
  return (
    e instanceof RentCastAuthError ||
    e instanceof RentCastRateLimitError ||
    e instanceof RentCastUpstreamError
  );
}

function normalizeParams(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().toLowerCase()] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

function makeCacheKey(endpoint: RentcastEndpoint, params: Record<string, any>): string {
  const raw = `${endpoint}|${normalizeParams(params)}`;
  return createHash("sha256").update(raw).digest("hex");
}

function buildUrl(endpoint: RentcastEndpoint, params: Record<string, any>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || String(v).length === 0) continue;
    qs.set(k, String(v));
  }
  const path =
    endpoint === "properties"
      ? "/v1/properties"
      : endpoint === "avm/value"
      ? "/v1/avm/value"
      : endpoint === "avm/rent/long-term"
      ? "/v1/avm/rent/long-term"
      : endpoint === "listings/sale"
      ? "/v1/listings/sale"
      : endpoint === "listings/rental/long-term"
      ? "/v1/listings/rental/long-term"
      : "/v1/markets";
  const q = qs.toString();
  return `${BASE}${path}${q ? `?${q}` : ""}`;
}

function readCache(cacheKey: string): unknown | null {
  const now = Date.now();
  const row = db
    .select()
    .from(rentcastCache)
    .where(and(eq(rentcastCache.cacheKey, cacheKey), gt(rentcastCache.expiresAt, now)))
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function writeCache(
  cacheKey: string,
  endpoint: RentcastEndpoint,
  payload: unknown,
  ttlSeconds: number,
): void {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;
  const json = JSON.stringify(payload);
  // Best-effort: opportunistically purge a few stale rows so the table doesn't
  // grow without bound. SQLite DELETE with LIMIT isn't portable in drizzle, so
  // we just delete everything stale on a write — cheap due to the index.
  try {
    db.delete(rentcastCache).where(lt(rentcastCache.expiresAt, now)).run();
  } catch {
    /* non-fatal */
  }
  // Upsert: try insert; on conflict update.
  try {
    db.insert(rentcastCache)
      .values({ cacheKey, endpoint, payload: json, createdAt: now, expiresAt })
      .onConflictDoUpdate({
        target: rentcastCache.cacheKey,
        set: { endpoint, payload: json, createdAt: now, expiresAt },
      })
      .run();
  } catch (e) {
    console.warn("[rentcast] cache write failed", (e as Error).message);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function rawFetch(
  url: string,
  apiKey: string,
): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "FlipAnalyzer/1.0 (real estate deal analyzer)",
      Accept: "application/json",
      "X-Api-Key": apiKey,
    },
  });
  if (res.status === 401) {
    console.error("[rentcast] 401 unauthorized — check RENTCAST_API_KEY");
    throw new RentCastAuthError();
  }
  if (res.status === 429) {
    console.error("[rentcast] 429 rate-limited");
    throw new RentCastRateLimitError();
  }
  if (res.status === 404) {
    // Surface as null to the caller — handled in getOrFetch.
    return null;
  }
  if (res.status >= 500) {
    throw new RentCastUpstreamError(res.status);
  }
  if (!res.ok) {
    throw new RentCastUpstreamError(res.status, `Upstream ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch a RentCast endpoint with cache + retry + typed errors.
 *
 * - Returns cached payload if a fresh row exists.
 * - On miss: calls upstream. On 429 retries once after 1s. On 5xx retries
 *   once after 500ms. On 404 returns null. On 401 throws RentCastAuthError
 *   immediately (no retry — the key isn't going to change in 1s).
 * - On success, writes to cache with the configured TTL.
 *
 * Throws `RentCastAuthError`, `RentCastRateLimitError`, or
 * `RentCastUpstreamError` so route handlers can map to user-facing 503s.
 */
export async function getOrFetch<T = unknown>(
  endpoint: RentcastEndpoint,
  params: Record<string, string | number | undefined | null>,
  opts?: { ttlSeconds?: number; bypassCache?: boolean },
): Promise<T | null> {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) {
    throw new RentCastAuthError("RentCast API key not configured");
  }

  const cacheKey = makeCacheKey(endpoint, params);
  if (!opts?.bypassCache) {
    const hit = readCache(cacheKey);
    if (hit !== null) {
      return hit as T;
    }
  }

  const url = buildUrl(endpoint, params);
  const ttl = opts?.ttlSeconds ?? TTL_SECONDS[endpoint];

  // Attempt 1
  try {
    const data = await rawFetch(url, apiKey);
    if (data === null) return null; // 404 — don't cache "not found"
    writeCache(cacheKey, endpoint, data, ttl);
    return data as T;
  } catch (e) {
    // Retry once on 429 (1s) or 5xx (500ms). Auth errors don't retry.
    if (e instanceof RentCastRateLimitError) {
      await sleep(1000);
    } else if (e instanceof RentCastUpstreamError) {
      await sleep(500);
    } else {
      throw e; // RentCastAuthError or unknown — bail
    }
    // Attempt 2
    const data = await rawFetch(url, apiKey);
    if (data === null) return null;
    writeCache(cacheKey, endpoint, data, ttl);
    return data as T;
  }
}
