// Comp Hero manual-comp resolution (v1.7.4). Given raw user input — either a
// plain address or a Zillow/Redfin listing URL — assembles a best-effort
// ManualComp object:
//   1. Detect URL vs address.
//   2. If URL: try a server-side scrape (sold price/date/sqft/beds/baths/photo).
//      Zillow blocks aggressively — failures are expected and non-fatal.
//   3. Extract a human address from the URL path (Zillow/Redfin embed it) or
//      use the raw address input directly.
//   4. Always call RentCast /properties for enrichment (style, etc.) to fill
//      whatever the scrape didn't get. Scrape data wins on conflicts.
//
// Never throws for "scrape failed" — that's an expected, non-fatal path. Only
// throws if we truly cannot resolve any address at all.

import * as cheerio from "cheerio";
import { randomUUID } from "node:crypto";
import { getOrFetch as rcGet } from "./rentcast";
import type { ManualComp } from "@shared/schema";

const ZILLOW_RE = /zillow\.com/i;
const REDFIN_RE = /redfin\.com/i;

export function detectUrlKind(input: string): "zillow" | "redfin" | "address" {
  if (ZILLOW_RE.test(input)) return "zillow";
  if (REDFIN_RE.test(input)) return "redfin";
  return "address";
}

/**
 * Extract a human-readable address from a Zillow/Redfin URL path.
 *
 * Zillow:  https://www.zillow.com/homedetails/1208-Madison-Drive-Annapolis-MD-21403/12345_zpid/
 *          -> "1208 Madison Drive Annapolis MD 21403"
 * Redfin:  https://www.redfin.com/MD/Annapolis/1208-Madison-Dr-21403/home/12345
 *          -> "1208 Madison Dr Annapolis MD 21403"
 */
export function addressFromListingUrl(input: string, kind: "zillow" | "redfin"): string | null {
  try {
    const url = new URL(input.trim());
    const segments = url.pathname.split("/").filter(Boolean);
    if (kind === "zillow") {
      // /homedetails/<slug>/<zpid>_zpid/
      const idx = segments.findIndex((s) => s.toLowerCase() === "homedetails");
      const slug = idx >= 0 ? segments[idx + 1] : segments.find((s) => s.includes("-"));
      if (!slug) return null;
      return slug.replace(/-/g, " ").trim();
    }
    // Redfin: /<ST>/<City>/<slug-with-zip>/home/<id>
    if (segments.length < 3) return null;
    const state = segments[0];
    const city = segments[1].replace(/-/g, " ");
    const slug = segments[2].replace(/-/g, " ");
    return `${slug} ${city} ${state}`.replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

export interface ScrapedComp {
  soldPrice: number | null;
  soldDate: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  photoUrl: string | null;
}

// Best-effort HTML scrape. Wrapped so ANY failure (network, block-page, parse
// error) resolves to null rather than throwing — the caller falls back to the
// address + RentCast path regardless.
export async function tryScrapeListing(url: string): Promise<ScrapedComp | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // Listing pages can be slow / redirect-heavy; don't hang the request forever.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // Prefer JSON-LD structured data when present (both sites sometimes embed it).
    let soldPrice: number | null = null;
    let sqft: number | null = null;
    let beds: number | null = null;
    let baths: number | null = null;
    let photoUrl: string | null = null;

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).contents().text());
        const obj = Array.isArray(json) ? json[0] : json;
        if (obj?.image) {
          photoUrl = Array.isArray(obj.image) ? obj.image[0] : obj.image;
        }
        if (obj?.offers?.price) {
          const n = Number(obj.offers.price);
          if (Number.isFinite(n) && n > 0) soldPrice = n;
        }
      } catch {
        /* not JSON-LD we can use */
      }
    });

    // og:image meta as a photo fallback.
    if (!photoUrl) {
      const og = $('meta[property="og:image"]').attr("content");
      if (og) photoUrl = og;
    }

    // Generic text-scan fallbacks — brittle by nature; best-effort only.
    const bodyText = $("body").text().replace(/\s+/g, " ");
    if (soldPrice == null) {
      const m = bodyText.match(/Sold(?: for| price)?[:\s]*\$([\d,]{4,})/i);
      if (m) {
        const n = Number(m[1].replace(/,/g, ""));
        if (Number.isFinite(n) && n > 0) soldPrice = n;
      }
    }
    const sqftMatch = bodyText.match(/([\d,]{3,6})\s*(?:sq\s*ft|sqft)/i);
    if (sqftMatch) {
      const n = Number(sqftMatch[1].replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) sqft = n;
    }
    const bedsMatch = bodyText.match(/(\d+(?:\.\d)?)\s*(?:bed|bd)\b/i);
    if (bedsMatch) beds = Number(bedsMatch[1]);
    const bathsMatch = bodyText.match(/(\d+(?:\.\d)?)\s*(?:bath|ba)\b/i);
    if (bathsMatch) baths = Number(bathsMatch[1]);

    let soldDate: string | null = null;
    const dateMatch = bodyText.match(/Sold(?: on)?[:\s]*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
    if (dateMatch) {
      const parsed = new Date(dateMatch[1]);
      if (!Number.isNaN(parsed.getTime())) soldDate = parsed.toISOString();
    }

    if (!soldPrice && !sqft && !beds && !baths && !photoUrl) return null;
    return { soldPrice, soldDate, sqft, beds, baths, photoUrl };
  } catch (e) {
    // Zillow blocks aggressively (bot walls, 403s, CAPTCHA redirects); Redfin
    // is somewhat friendlier but still not guaranteed. Log and move on.
    console.warn("[compHeroManual] scrape failed:", (e as Error)?.message ?? e);
    return null;
  }
}

interface RentcastPropertyEnrichment {
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  style: string | null;
}

async function rentcastEnrich(address: string): Promise<RentcastPropertyEnrichment> {
  const empty: RentcastPropertyEnrichment = {
    city: null,
    state: null,
    zip: null,
    sqft: null,
    beds: null,
    baths: null,
    style: null,
  };
  try {
    const data: any = await rcGet("properties", { address });
    const rec = Array.isArray(data) ? data[0] : data;
    if (!rec) return empty;
    return {
      city: rec.city ?? null,
      state: rec.state ?? null,
      zip: rec.zipCode ?? null,
      sqft: rec.squareFootage ?? null,
      beds: rec.bedrooms ?? null,
      baths: rec.bathrooms ?? null,
      style: rec.architectureType ?? null,
    };
  } catch (e) {
    console.warn("[compHeroManual] RentCast enrich failed:", (e as Error)?.message ?? e);
    return empty;
  }
}

/**
 * Resolve raw user input (address or Zillow/Redfin URL) into a full ManualComp.
 * Scrape is attempted first for URLs; RentCast always runs to backfill fields
 * the scrape couldn't get (or all fields, for a plain address).
 */
export async function resolveManualComp(rawInput: string): Promise<ManualComp> {
  const input = rawInput.trim();
  const kind = detectUrlKind(input);

  let source: ManualComp["source"];
  let address: string;
  let scraped: ScrapedComp | null = null;

  if (kind === "zillow" || kind === "redfin") {
    scraped = await tryScrapeListing(input);
    const extracted = addressFromListingUrl(input, kind);
    address = extracted ?? input;
    source =
      kind === "zillow"
        ? "manual-url-zillow"
        : kind === "redfin"
          ? "manual-url-redfin"
          : "manual-url-fallback";
    if (!extracted) source = "manual-url-fallback";
  } else {
    address = input;
    source = "manual-address";
  }

  const enrich = await rentcastEnrich(address);

  return {
    id: randomUUID(),
    source,
    address,
    city: enrich.city,
    state: enrich.state,
    zip: enrich.zip,
    sqft: scraped?.sqft ?? enrich.sqft,
    beds: scraped?.beds ?? enrich.beds,
    baths: scraped?.baths ?? enrich.baths,
    style: enrich.style,
    soldPrice: scraped?.soldPrice ?? null,
    soldDate: scraped?.soldDate ?? null,
    photoUrl: scraped?.photoUrl ?? null,
    addedAt: Date.now(),
    isEditable: true,
  };
}
