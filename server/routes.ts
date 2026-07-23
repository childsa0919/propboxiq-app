import type { Express, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import { insertDealSchema } from "@shared/schema";
import {
  sessionMiddleware,
  requireAuth,
  newToken,
  isValidEmail,
  setSessionCookie,
  clearSessionCookie,
  sendMagicLinkEmail,
  sendEmailWithAttachment,
  TIMINGS,
} from "./auth";
import {
  ANNE_ARUNDEL_RESIDENTIAL,
  normalizeAaCountyDistrict,
} from "./zoning/anne-arundel";
import {
  getDistress,
  getOwnership,
  getMarketSaleTrend,
  KeyMissingError,
  UpstreamError,
} from "./attom";
import {
  getOrFetch as rcGet,
  RentCastAuthError,
  RentCastRateLimitError,
  RentCastUpstreamError,
} from "./rentcast";
import { enrichComp, enrichComps } from "./compEnrich";
import { computeArvFromComps } from "@shared/arv";
import { stylesMatch } from "@shared/propAttributes";
import { MD_GIS_SCOPE } from "./siteGis";
import {
  runWelcomeDrip,
  sendDripBatch,
  unsubscribeContactInAudience,
} from "./emails/campaign";
import {
  unsubscribedPage,
  resubscribedPage,
  invalidTokenPage,
} from "./emails/unsubscribe-page";

// Map a typed RentCast error to a 503 + friendly body. Returns true if a
// response was sent. Routes call this in their catch blocks so they don't
// have to repeat the mapping.
function sendRentcastErrorResponse(res: Response, err: unknown): boolean {
  if (err instanceof RentCastAuthError) {
    res.status(503).json({
      error: "data_provider_auth",
      message: "Property data temporarily unavailable",
    });
    return true;
  }
  if (err instanceof RentCastRateLimitError) {
    res.status(503).json({
      error: "data_provider_rate_limit",
      message: "Property data is rate-limited; try again in a moment",
    });
    return true;
  }
  if (err instanceof RentCastUpstreamError) {
    res.status(503).json({
      error: "data_provider_unavailable",
      message: "Property data temporarily unavailable",
    });
    return true;
  }
  return false;
}

// Census Geocoder — free, no key, US addresses
const CENSUS_BASE =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "FlipAnalyzer/1.0 (real estate deal analyzer)",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return await res.json();
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`Upstream timeout after ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Attach session to every request first.
  app.use(sessionMiddleware);
  // Body parser is registered in server/index.ts. Trust the proxy so Secure cookies work.
  app.set("trust proxy", 1);

  // ----- Auth: request magic link -----
  //
  // App Store reviewer shortcut: if the email matches APP_REVIEWER_EMAIL
  // (set as an env var on Render), we skip the email round-trip and issue
  // a session cookie immediately. This is the only way Apple's reviewer
  // can sign in to test the app — they don't have access to our mailbox.
  // Rotate the env var after launch is approved.
  app.post("/api/auth/request", async (req: Request, res: Response) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const reviewerEmail = (process.env.APP_REVIEWER_EMAIL || "").trim().toLowerCase();
    if (reviewerEmail && email === reviewerEmail) {
      const { user } = await storage.upsertUser(email);
      await storage.touchLogin(user.id);
      const sid = newToken(48);
      await storage.createSession(sid, user.id, TIMINGS.SESSION_TTL_MS);
      setSessionCookie(res, sid);
      return res.json({ ok: true, email, reviewer: true });
    }

    const token = newToken(32);
    await storage.createMagicToken(token, email, TIMINGS.TOKEN_TTL_MS);

    // Build the verify link using the request's origin so it works locally and in prod.
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const origin = process.env.PUBLIC_ORIGIN || `${proto}://${host}`;
    const link = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;

    const send = await sendMagicLinkEmail({ to: email, link });
    if (!send.ok) {
      return res.status(500).json({ error: send.error ?? "Could not send email." });
    }
    res.json({ ok: true, email });
  });

  // ----- Auth: verify token, create session, redirect home -----
  app.get("/api/auth/verify", async (req: Request, res: Response) => {
    const token = String(req.query.token ?? "");
    if (!token) return res.status(400).send("Missing token");
    const consumed = await storage.consumeMagicToken(token);
    if (!consumed) {
      // Render a small HTML so the user lands somewhere, not a JSON dump.
      return res.status(400).send(
        `<!doctype html><html><body style="font-family:system-ui;padding:48px;max-width:520px;margin:0 auto;color:#0a0e12;">
        <h1 style="font-size:24px;">This link is no longer valid</h1>
        <p style="color:#475569;">Magic links expire after 30 minutes and can only be used once. Request a new one to sign in.</p>
        <p style="margin-top:24px;"><a href="/" style="color:#126D85;font-weight:600;">&larr; Back to PropBoxIQ</a></p>
        </body></html>`
      );
    }
    const { user } = await storage.upsertUser(consumed.email);
    await storage.touchLogin(user.id);
    const sid = newToken(48);
    await storage.createSession(sid, user.id, TIMINGS.SESSION_TTL_MS);
    setSessionCookie(res, sid);
    res.redirect(302, "/");
  });

  // ----- Auth: Google OAuth start -----
  // Redirects user to Google's consent screen.
  app.get("/api/auth/google", async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).send("GOOGLE_CLIENT_ID not configured");

    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const origin = process.env.PUBLIC_ORIGIN || `${proto}://${host}`;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

    // CSRF state — short-lived, single-use, bound to a cookie
    const state = newToken(24);
    const stateParts = [
      `pbq_oauth_state=${encodeURIComponent(state)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=600", // 10 min
    ];
    if (process.env.NODE_ENV === "production") stateParts.push("Secure");
    res.setHeader("Set-Cookie", stateParts.join("; "));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // ----- Auth: Google OAuth callback -----
  // Google sends the user back here with a one-time `code`. We exchange it for tokens,
  // fetch the user's email/profile, upsert the user, set our session cookie, redirect home.
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).send("Google OAuth env vars missing");
    }

    const code = String(req.query.code ?? "");
    const stateFromGoogle = String(req.query.state ?? "");
    const errFromGoogle = req.query.error ? String(req.query.error) : null;
    if (errFromGoogle) {
      return res.status(400).send(
        `<!doctype html><html><body style="font-family:system-ui;padding:48px;max-width:520px;margin:0 auto;color:#0a0e12;">
        <h1 style="font-size:24px;">Google sign-in cancelled</h1>
        <p style="color:#475569;">${errFromGoogle === "access_denied" ? "You declined access. Try again if you'd like to sign in." : `Google returned: ${errFromGoogle}`}</p>
        <p style="margin-top:24px;"><a href="/" style="color:#126D85;font-weight:600;">&larr; Back to PropBoxIQ</a></p>
        </body></html>`
      );
    }
    if (!code) return res.status(400).send("Missing code");

    // Verify state cookie
    const rawCookie = req.headers.cookie ?? "";
    const stateCookie = rawCookie
      .split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("pbq_oauth_state="));
    const stateExpected = stateCookie
      ? decodeURIComponent(stateCookie.slice("pbq_oauth_state=".length))
      : null;
    if (!stateExpected || stateExpected !== stateFromGoogle) {
      return res.status(400).send("Invalid OAuth state");
    }
    // Clear the state cookie
    const clearParts = ["pbq_oauth_state=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (process.env.NODE_ENV === "production") clearParts.push("Secure");

    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const origin = process.env.PUBLIC_ORIGIN || `${proto}://${host}`;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

    try {
      // Exchange code for tokens
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResp.ok) {
        const t = await tokenResp.text();
        console.error("[google-oauth] token exchange failed", tokenResp.status, t);
        return res.status(500).send("Google token exchange failed");
      }
      const tokens = (await tokenResp.json()) as {
        access_token: string;
        id_token?: string;
      };

      // Fetch profile from userinfo endpoint
      const profileResp = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      if (!profileResp.ok) {
        console.error("[google-oauth] userinfo failed", profileResp.status);
        return res.status(500).send("Could not fetch Google profile");
      }
      const profile = (await profileResp.json()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      if (!profile.email) {
        return res.status(400).send("Google account has no email on file");
      }

      const { user, isNew } = await storage.upsertUser(profile.email, profile.name ?? null);
      await storage.touchLogin(user.id);

      // First Google login → kick off the welcome drip. Best-effort and
      // fire-and-forget so a slow/failed Resend call never blocks sign-in.
      if (isNew) {
        runWelcomeDrip(user).catch((e) =>
          console.error("[google-oauth] welcome drip failed", e),
        );
      }

      const sid = newToken(48);
      await storage.createSession(sid, user.id, TIMINGS.SESSION_TTL_MS);

      // Set both cookies (session + clear state) in one Set-Cookie header array
      const isProd = process.env.NODE_ENV === "production";
      const sessionParts = [
        `pbq_session=${encodeURIComponent(sid)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${Math.floor(TIMINGS.SESSION_TTL_MS / 1000)}`,
      ];
      if (isProd) sessionParts.push("Secure");
      res.setHeader("Set-Cookie", [sessionParts.join("; "), clearParts.join("; ")]);
      res.redirect(302, "/");
    } catch (e: any) {
      console.error("[google-oauth] callback error", e);
      res.status(500).send("Google sign-in failed");
    }
  });

  // ----- Auth: who am I? -----
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    const userId = (req as any).userId as number | undefined;
    if (!userId) return res.json({ user: null });
    const u = await storage.getUserById(userId);
    if (!u) return res.json({ user: null });
    res.json({
      user: { id: u.id, email: u.email, name: u.name },
    });
  });

  // ----- Auth: sign out -----
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const userId = (req as any).userId as number | undefined;
    if (userId) {
      // Read session cookie raw
      const raw = req.headers.cookie ?? "";
      const m = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith("pbq_session="));
      if (m) {
        const sid = decodeURIComponent(m.slice("pbq_session=".length));
        await storage.deleteSession(sid);
      }
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // ----- Unsubscribe (one-click) -----
  // Linked from every welcome-drip email footer and the RFC-8058
  // List-Unsubscribe header. Sets unsubscribed_at (gates all future sends)
  // and marks the Resend audience contact unsubscribed so broadcasts skip them.
  app.get("/unsubscribe", async (req: Request, res: Response) => {
    const token = String(req.query.token ?? "");
    const user = await storage.markUnsubscribed(token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!user) return res.status(404).send(invalidTokenPage());
    unsubscribeContactInAudience(user.email).catch((e) =>
      console.error("[unsubscribe] audience sync failed", e),
    );
    res.send(unsubscribedPage(token));
  });

  // Some mail clients POST the one-click List-Unsubscribe; accept it too.
  app.post("/unsubscribe", async (req: Request, res: Response) => {
    const token = String(req.query.token ?? req.body?.token ?? "");
    const user = await storage.markUnsubscribed(token);
    if (user) {
      unsubscribeContactInAudience(user.email).catch((e) =>
        console.error("[unsubscribe] audience sync failed", e),
      );
    }
    res.status(200).end();
  });

  app.get("/unsubscribe/resubscribe", async (req: Request, res: Response) => {
    const token = String(req.query.token ?? "");
    const user = await storage.resubscribe(token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!user) return res.status(404).send(invalidTokenPage());
    res.send(resubscribedPage());
  });

  // ----- Internal: drip batch (Option-A cron fallback) -----
  // Protected by a bearer token. Safe to run alongside Resend scheduling —
  // it only sends drips that are due AND not yet marked sent.
  app.post("/api/internal/send-drip-batch", async (req: Request, res: Response) => {
    const expected = process.env.INTERNAL_CRON_TOKEN;
    if (!expected) return res.status(503).json({ error: "cron not configured" });
    const auth = req.headers.authorization ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (provided !== expected) return res.status(401).json({ error: "unauthorized" });
    const result = await sendDripBatch();
    res.json({ ok: true, ...result });
  });

  // ----- Address autocomplete -----
  // Strategy: RentCast /properties first (resolves on partial street, no city
  // required), then fall back to Census Geocoder (rigid "street + city" match)
  // for anything RentCast doesn't cover. Census is also the source of
  // lat/lon when RentCast doesn't include coordinates.
  app.get("/api/geocode", async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 4) {
      return res.json({ matches: [] });
    }

    type Match = {
      matchedAddress: string;
      lat: number | null;
      lon: number | null;
      components: {
        street: string;
        city: string;
        state: string;
        zip: string;
      };
    };

    // ---- Attempt 1: RentCast /properties (no city required) ----
    // Gate by length + leading digit (i.e. "12704 Hill...") so we don't burn
    // the quota on every partial keystroke. RentCast expects a house number
    // anyway — "Hillmeade" alone returns nothing useful.
    const looksLikeStreet = q.length >= 8 && /^\d/.test(q);
    let rentcastMatches: Match[] = [];
    if (looksLikeStreet) try {
      const data: any = await rcGet("properties", { address: q });
      if (Array.isArray(data)) {
        rentcastMatches = data
          .filter((p: any) => p?.formattedAddress)
          .slice(0, 5)
          .map((p: any) => ({
            matchedAddress: String(p.formattedAddress),
            lat: typeof p.latitude === "number" ? p.latitude : null,
            lon: typeof p.longitude === "number" ? p.longitude : null,
            components: {
              street: String(p.addressLine1 ?? "").trim(),
              city: String(p.city ?? "").trim(),
              state: String(p.state ?? "").trim(),
              zip: String(p.zipCode ?? "").trim(),
            },
          }));
      }
    } catch (e) {
      // typed errors → fall through to Census silently
      if (
        !(e instanceof RentCastAuthError) &&
        !(e instanceof RentCastRateLimitError) &&
        !(e instanceof RentCastUpstreamError)
      ) {
        console.warn("[geocode] rentcast error:", (e as Error).message);
      }
    }

    if (rentcastMatches.length > 0) {
      return res.json({ matches: rentcastMatches });
    }

    // ---- Attempt 2: Census Geocoder fallback ----
    try {
      const url = `${CENSUS_BASE}?address=${encodeURIComponent(
        q
      )}&benchmark=Public_AR_Current&format=json`;
      const data: any = await fetchJson(url);
      const matches: Match[] = (data?.result?.addressMatches ?? []).map((m: any) => ({
        matchedAddress: m.matchedAddress as string,
        lat: m.coordinates?.y as number,
        lon: m.coordinates?.x as number,
        components: {
          street: [
            m.addressComponents?.fromAddress,
            m.addressComponents?.preDirection,
            m.addressComponents?.streetName,
            m.addressComponents?.suffixType,
            m.addressComponents?.suffixDirection,
          ]
            .filter(Boolean)
            .join(" ")
            .trim(),
          city: m.addressComponents?.city,
          state: m.addressComponents?.state,
          zip: m.addressComponents?.zip,
        },
      }));
      res.json({ matches });
    } catch (e: any) {
      console.error("geocode error", e?.message);
      res.json({ matches: [] });
    }
  });

  // ----- Comps (RentCast AVM with cascading radius) -----
  // Filter rules: ±15% sqft, last 6 months. Try 0.25 mi → 0.5 mi → 0.75 mi
  // until we have at least 4 comps. Returns comps + computed ARV (median $/sqft).
  app.get("/api/comps", async (req: Request, res: Response) => {
    const address = String(req.query.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });

    if (!process.env.RENTCAST_API_KEY) {
      return res.status(503).json({
        error: "data_provider_auth",
        message: "Property data temporarily unavailable",
      });
    }

    // Optional post-rehab target overrides. When provided, we match comps to these specs
    // instead of the subject property's current footprint.
    const parseNum = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const targetSqft = parseNum(req.query.targetSqft);
    const targetBeds = parseNum(req.query.targetBeds);
    const targetBaths = parseNum(req.query.targetBaths);

    const SQFT_TOLERANCE = 0.15; // ±15%
    const DAYS_OLD = 180;        // last ~6 months
    // Cascade in 0.25 mi steps up to 3.0 mi. Flag anything past 0.75 mi.
    const RADII = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    const MIN_COMPS = 4;
    const STANDARD_MAX_RADIUS = 0.75;

    type Comp = {
      id: string;
      address: string;
      price: number;
      sqft: number | null;
      beds: number | null;
      baths: number | null;
      yearBuilt: number | null;
      distance: number;
      daysOld: number;
      pricePerSqft: number | null;
      lat: number | null;
      lon: number | null;
      saleStatus: string | null;
      // Enrichment (item 4/5/6) — populated after the cascade selects the comp set.
      style?: string | null;
      heatingType?: string | null;
      coolingType?: string | null;
      hasPool?: boolean | null;
      water?: "public" | "well" | "unknown";
      sewer?: "public" | "septic" | "unknown";
      waterSewerLabel?: string | null;
      styleMatch?: boolean;
    };

    let subjectSqft: number | null = null;
    let subjectAddress: string | null = null;
    let subjectLat: number | null = null;
    let subjectLon: number | null = null;
    let usedRadius: number | null = null;
    let comps: Comp[] = [];
    let lastError: string | null = null;

    let abortReason: "auth" | "rate_limit" | null = null;

    for (const radius of RADII) {
      try {
        const data: any = await rcGet("avm/value", {
          address,
          radius,
          daysOld: DAYS_OLD,
          compCount: 25,
        });
        if (!data) {
          // 404 from upstream — try the next radius.
          lastError = "No comps at this radius";
          continue;
        }

        const sp = data?.subjectProperty ?? {};
        subjectSqft = (sp.squareFootage as number | undefined) ?? subjectSqft;
        subjectAddress = (sp.formattedAddress as string | undefined) ?? subjectAddress;
        subjectLat = (sp.latitude as number | undefined) ?? subjectLat;
        subjectLon = (sp.longitude as number | undefined) ?? subjectLon;

        // Match window centers on post-rehab target sqft if provided, else subject sqft.
        const matchSqft = targetSqft ?? subjectSqft;

        const raw = (data?.comparables ?? []) as any[];
        const filtered: Comp[] = raw
          .filter((c) => Number.isFinite(c?.price) && c.price > 0)
          .filter((c) => {
            if (!matchSqft || !c?.squareFootage) return true; // keep if we can't compare
            const ratio = c.squareFootage / matchSqft;
            return ratio >= 1 - SQFT_TOLERANCE && ratio <= 1 + SQFT_TOLERANCE;
          })
          .filter((c) => {
            // Bed/bath match — ±1 bed and ±1 bath of target if provided
            if (targetBeds != null && c?.bedrooms != null) {
              if (Math.abs(Number(c.bedrooms) - targetBeds) > 1) return false;
            }
            if (targetBaths != null && c?.bathrooms != null) {
              if (Math.abs(Number(c.bathrooms) - targetBaths) > 1) return false;
            }
            return true;
          })
          .map((c) => ({
            id: c.id,
            address: c.formattedAddress,
            price: c.price,
            sqft: c.squareFootage ?? null,
            beds: c.bedrooms ?? null,
            baths: c.bathrooms ?? null,
            yearBuilt: c.yearBuilt ?? null,
            distance: c.distance ?? 0,
            daysOld: c.daysOld ?? 0,
            pricePerSqft: c.squareFootage
              ? Math.round(c.price / c.squareFootage)
              : null,
            lat: c.latitude ?? null,
            lon: c.longitude ?? null,
            saleStatus: c.status ?? null,
          }));

        if (filtered.length >= MIN_COMPS) {
          comps = filtered.slice(0, 8); // cap to 8 best
          usedRadius = radius;
          break;
        }
        // Save partial result in case we never hit MIN_COMPS
        if (filtered.length > comps.length) {
          comps = filtered.slice(0, 8);
          usedRadius = radius;
        }
      } catch (e: any) {
        // Auth + rate-limit errors abort the cascade — burning 10 calls
        // against a bad key or a quota wall is worse than failing fast.
        if (e instanceof RentCastAuthError) {
          abortReason = "auth";
          break;
        }
        if (e instanceof RentCastRateLimitError) {
          abortReason = "rate_limit";
          break;
        }
        lastError = e?.message ?? "RentCast lookup failed";
      }
    }

    if (abortReason === "auth") {
      return res.status(503).json({
        error: "data_provider_auth",
        message: "Property data temporarily unavailable",
      });
    }
    if (abortReason === "rate_limit") {
      return res.status(503).json({
        error: "data_provider_rate_limit",
        message: "Property data is rate-limited; try again in a moment",
      });
    }

    if (comps.length === 0) {
      return res.status(404).json({
        error:
          lastError ??
          "No comparable sales found within 3 miles in the last 6 months.",
        radiusSearched: RADII[RADII.length - 1],
      });
    }

    // Quality assessment for UI flags
    type QualityLevel = "good" | "wide" | "low";
    let qualityLevel: QualityLevel = "good";
    let qualityMessage: string | null = null;
    if (comps.length < MIN_COMPS) {
      qualityLevel = "low";
      qualityMessage = `Only ${comps.length} comparable sale${comps.length === 1 ? "" : "s"} found within ${usedRadius} mi. Treat ARV as a rough estimate.`;
    } else if (usedRadius != null && usedRadius > STANDARD_MAX_RADIUS) {
      qualityLevel = "wide";
      qualityMessage = `Search expanded to ${usedRadius} mi to find ${comps.length} comps. Closer comps weren't available.`;
    }

    const mean = (arr: number[]) =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    // ----- Enrichment (item 4): house style, HVAC, pool + MD GIS water/sewer -----
    // Fetch per-comp attributes plus the subject's, all best-effort in parallel.
    const [subjectEnrich, compEnrichments] = await Promise.all([
      enrichComp({ address: subjectAddress ?? address, lat: subjectLat, lon: subjectLon }),
      enrichComps(comps.map((c) => ({ address: c.address, lat: c.lat, lon: c.lon }))),
    ]);
    const subjectStyle = subjectEnrich.style;
    comps = comps.map((c, i) => {
      const e = compEnrichments[i];
      return {
        ...c,
        style: e.style,
        heatingType: e.heatingType,
        coolingType: e.coolingType,
        hasPool: e.hasPool,
        water: e.water,
        sewer: e.sewer,
        waterSewerLabel: e.waterSewerLabel,
        styleMatch: stylesMatch(subjectStyle, e.style),
      };
    });

    // ----- Style-priority ranking (item 5) -----
    // If ≥6 comps match the subject's house style, ARV is driven by the top-4 of
    // those style-matched comps; otherwise fall back to top-4 by price across all.
    const STYLE_MATCH_MIN = 6;
    const styleMatchCount = comps.filter((c) => c.styleMatch).length;
    const useStyleMatched = subjectStyle != null && styleMatchCount >= STYLE_MATCH_MIN;
    const rankingPool = useStyleMatched ? comps.filter((c) => c.styleMatch) : comps;
    const arvBasis: "style-matched" | "top-price" = useStyleMatched
      ? "style-matched"
      : "top-price";

    // ----- Unified ARV (item 3): shared top-4-by-price × mean $/sqft formula -----
    // Band always uses the TOTAL comp count, not the (possibly narrowed) pool.
    const arvSqft = targetSqft ?? subjectSqft;
    const arvResult = computeArvFromComps(
      rankingPool.map((c) => ({ id: c.id, price: c.price, pricePerSqft: c.pricePerSqft })),
      arvSqft,
      comps.length,
    );
    const { arv, arvLow, arvHigh } = arvResult;
    console.log(
      `[comps] ARV ${arv} (basis=${arvBasis}, pool=${rankingPool.length}, ` +
        `anchor=${arvResult.anchorPpsf ?? "n/a"}/sqft, band=±${Math.round(arvResult.band * 100)}%)`,
    );

    // Reference numbers for the response (across ALL comps, for context)
    const medianPpsf = mean(
      comps.map((c) => c.pricePerSqft).filter((n): n is number => n != null)
    );

    res.json({
      subject: {
        address: subjectAddress ?? address,
        sqft: subjectSqft,
        style: subjectEnrich.style,
        heatingType: subjectEnrich.heatingType,
        coolingType: subjectEnrich.coolingType,
        hasPool: subjectEnrich.hasPool,
        water: subjectEnrich.water,
        sewer: subjectEnrich.sewer,
        waterSewerLabel: subjectEnrich.waterSewerLabel,
      },
      target: {
        sqft: targetSqft,
        beds: targetBeds,
        baths: targetBaths,
      },
      arv,
      arvLow,
      arvHigh,
      medianPricePerSqft: medianPpsf || null,
      // ARV math transparency — surface the top-4 used and the $/sqft anchor
      arvMethod: "top4-by-price-mean-ppsf",
      arvBasis,
      styleMatchCount,
      arvAnchorPpsf: arvResult.anchorPpsf,
      arvTopCompIds: arvResult.topCompIds,
      compCount: comps.length,
      radiusMiles: usedRadius,
      filters: {
        sqftTolerance: SQFT_TOLERANCE,
        daysOld: DAYS_OLD,
        targetBedsTolerance: targetBeds != null ? 1 : null,
        targetBathsTolerance: targetBaths != null ? 1 : null,
      },
      quality: {
        level: qualityLevel,
        message: qualityMessage,
        standardMaxRadius: STANDARD_MAX_RADIUS,
        minComps: MIN_COMPS,
      },
      comps,
    });
  });

  // ----- Rent comps (RentCast long-term rent AVM) -----
  // Mirrors /api/comps but for the rental side. Fetches the rent estimate plus
  // nearby rental comparables for the Hold wizard's monthly-rent step. Fixed at
  // 5 comps / 0.5 mi. Response is cached 24h in the shared RentCast SQLite cache
  // (keyed on endpoint+params), so a repeated Hold run on the same address costs
  // zero upstream credits.
  app.get("/api/rent-comps", async (req: Request, res: Response) => {
    const address = String(req.query.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });

    if (!process.env.RENTCAST_API_KEY) {
      return res.status(503).json({
        error: "data_provider_auth",
        message: "Property data temporarily unavailable",
      });
    }

    const COMP_COUNT = 5;
    const RADIUS = 0.5;

    type RentComp = {
      id: string;
      address: string;
      rent: number;
      sqft: number | null;
      beds: number | null;
      baths: number | null;
      distance: number;
      daysOld: number;
      lat: number | null;
      lon: number | null;
    };

    let data: any;
    try {
      data = await rcGet("avm/rent/long-term", {
        address,
        radius: RADIUS,
        compCount: COMP_COUNT,
      });
    } catch (e) {
      if (sendRentcastErrorResponse(res, e)) return;
      console.warn("[rent-comps] rentcast error:", (e as Error).message);
      return res.status(503).json({
        error: "data_provider_unavailable",
        message: "Rent comps temporarily unavailable",
      });
    }

    // 404 from upstream → no rental data for this address.
    if (!data) {
      return res.status(404).json({
        error: "No rent comps found for this address.",
        radiusMiles: RADIUS,
      });
    }

    const rawComps = (Array.isArray(data?.comparables) ? data.comparables : []) as any[];
    const comps: RentComp[] = rawComps
      .filter((c) => Number.isFinite(c?.price) && c.price > 0)
      .map((c) => ({
        id: String(c.id ?? c.formattedAddress ?? ""),
        address: String(c.formattedAddress ?? ""),
        rent: Math.round(c.price),
        sqft: c.squareFootage ?? null,
        beds: c.bedrooms ?? null,
        baths: c.bathrooms ?? null,
        distance: typeof c.distance === "number" ? c.distance : 0,
        daysOld: typeof c.daysOld === "number" ? c.daysOld : 0,
        lat: c.latitude ?? null,
        lon: c.longitude ?? null,
      }))
      .slice(0, COMP_COUNT);

    const median = Number.isFinite(data?.rent) ? Math.round(data.rent) : null;
    const rentLow = Number.isFinite(data?.rentRangeLow)
      ? Math.round(data.rentRangeLow)
      : null;
    const rentHigh = Number.isFinite(data?.rentRangeHigh)
      ? Math.round(data.rentRangeHigh)
      : null;

    res.json({
      median,
      rentLow,
      rentHigh,
      compCount: comps.length,
      radiusMiles: RADIUS,
      comps,
    });
  });

  // ----- Rent market trend (RentCast /markets rentalData) -----
  // Returns the area-median rent plus a 12-month history + YoY change for the
  // Hold result page's "12-mo rent trend" chart. Mirrors /api/rent-comps: same
  // RentCast SQLite cache (24h), typed-error handling, and a clean
  // `{ available: false }` envelope when the ZIP has no rental market data.
  // propertyType filters RentCast's dataByPropertyType slice; defaults to
  // Single Family. History is on the Foundation tier (same as /api/market/:zip).
  app.get("/api/rent-market", async (req: Request, res: Response) => {
    const zip = String(req.query.zip ?? "").trim();
    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: "valid 5-digit ZIP required" });
    }
    if (!process.env.RENTCAST_API_KEY) {
      return res.status(503).json({
        error: "data_provider_auth",
        message: "Property data temporarily unavailable",
      });
    }

    // Map the client property-type token to RentCast's dataByPropertyType label.
    const ptParam = String(req.query.propertyType ?? "single-family").trim();
    const PT_LABEL: Record<string, string> = {
      "single-family": "Single Family",
      "multi-family": "Multi-Family",
      condo: "Condo",
    };
    const ptLabel = PT_LABEL[ptParam] ?? "Single Family";

    let market: any;
    try {
      market = await rcGet("markets", { zipCode: zip, historyRange: 12 });
    } catch (e) {
      if (sendRentcastErrorResponse(res, e)) return;
      console.warn("[rent-market] rentcast error:", (e as Error).message);
      return res.status(503).json({
        error: "data_provider_unavailable",
        message: "Rent trend temporarily unavailable",
      });
    }

    const rentalData: any = market?.rentalData ?? null;
    if (!rentalData) {
      return res.json({ available: false });
    }

    // Prefer the requested property-type slice; fall back to the all-types
    // aggregate when that slice (or its rent) is missing.
    const byType = Array.isArray(rentalData.dataByPropertyType)
      ? rentalData.dataByPropertyType
      : [];
    const slice =
      byType.find((s: any) => s?.propertyType === ptLabel) ?? null;

    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };
    // RentCast exposes averageRent / medianRent depending on the dataset; take
    // median first, fall back to average.
    const rentOf = (o: any): number | null =>
      num(o?.medianRent) ?? num(o?.averageRent);

    const currentMedian = rentOf(slice) ?? rentOf(rentalData);

    // history is keyed by YYYY-MM. Pull the per-type slice's history when
    // present, else the top-level history. Sort ascending, keep last 12.
    const histObj: Record<string, any> =
      slice?.history && typeof slice.history === "object"
        ? slice.history
        : rentalData.history && typeof rentalData.history === "object"
          ? rentalData.history
          : {};
    const history = Object.keys(histObj)
      .filter((k) => /^\d{4}-\d{2}/.test(k))
      .sort()
      .map((month) => ({ month: month.slice(0, 7), median: rentOf(histObj[month]) }))
      .filter((h): h is { month: string; median: number } => h.median != null)
      .slice(-12);

    if (currentMedian == null || history.length < 2) {
      return res.json({ available: false });
    }

    // YoY: latest vs. the oldest point in the (≤12-month) window — which is the
    // point ~12 months back when we have a full year of history.
    const latest = history[history.length - 1].median;
    const earliest = history[0].median;
    const yoyChange =
      earliest > 0 ? Math.round(((latest - earliest) / earliest) * 1000) / 10 : 0;

    res.json({
      available: true,
      zip,
      propertyType: ptParam,
      currentMedian,
      yoyChange,
      history,
    });
  });

  // ----- Subject property facts via RentCast (cheap lookup) -----
  // Returns sqft / beds / baths / yearBuilt for the address so we can prefill
  // the post-rehab spec inputs with the as-is footprint.
  app.get("/api/property/lookup", async (req: Request, res: Response) => {
    const address = String(req.query.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });
    try {
      const data: any = await rcGet("properties", { address });
      // RentCast returns an array; take first match
      const first = Array.isArray(data) ? data[0] : data;
      if (!first) return res.status(404).json({ error: "property not found" });
      // Lot size is reported in square feet — convert to acres (1 ac = 43,560 sqft)
      const lotSqft = (first.lotSize as number | undefined) ?? null;
      const lotAcres =
        lotSqft && lotSqft > 0
          ? Math.round((lotSqft / 43560) * 1000) / 1000 // 3 decimal precision
          : null;
      res.json({
        address: first.formattedAddress ?? address,
        sqft: first.squareFootage ?? null,
        beds: first.bedrooms ?? null,
        baths: first.bathrooms ?? null,
        lotSqft,
        lotAcres,
        yearBuilt: first.yearBuilt ?? null,
        propertyType: first.propertyType ?? null,
      });
    } catch (e: any) {
      if (sendRentcastErrorResponse(res, e)) return;
      res
        .status(404)
        .json({ error: e?.message ?? "Property lookup failed" });
    }
  });

  // ----- Full property profile via RentCast -----
  // Fans out to /properties, /avm/value, /avm/rent, /listings/sale, /listings/rental, /markets in parallel.
  // Returns one normalized payload with everything the result page can show.
  app.get("/api/property/full", async (req: Request, res: Response) => {
    const address = String(req.query.address ?? "").trim();
    const zip = String(req.query.zip ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });
    if (!process.env.RENTCAST_API_KEY) {
      return res.status(503).json({
        error: "data_provider_auth",
        message: "Property data temporarily unavailable",
      });
    }

    // Per-call wrapper: 401/429 propagate (we want to short-circuit the whole
    // call and surface a 503), other errors are swallowed to null so a single
    // missing data source doesn't blank out the whole profile.
    let fatalError: unknown = null;
    const safe = async <T>(p: Promise<T | null>): Promise<T | null> => {
      try {
        return await p;
      } catch (e) {
        if (
          e instanceof RentCastAuthError ||
          e instanceof RentCastRateLimitError
        ) {
          fatalError = fatalError ?? e;
          return null;
        }
        // Log other upstream issues but don't fail the whole profile.
        console.warn("[rentcast] sub-call failed:", (e as Error).message);
        return null;
      }
    };

    const [property, rentAvm, saleListings, rentalListings, market] =
      await Promise.all([
        safe<any>(rcGet("properties", { address })),
        safe<any>(rcGet("avm/rent/long-term", { address })),
        safe<any>(rcGet("listings/sale", { address })),
        safe<any>(rcGet("listings/rental/long-term", { address })),
        zip
          ? safe<any>(rcGet("markets", { zipCode: zip }))
          : Promise.resolve(null),
      ]);

    if (fatalError) {
      if (sendRentcastErrorResponse(res, fatalError)) return;
    }

    const p = Array.isArray(property) ? property[0] : property;
    if (!p) return res.status(404).json({ error: "property not found" });

    // Lot size in sqft → acres
    const lotSqft = (p.lotSize as number | undefined) ?? null;
    const lotAcres =
      lotSqft && lotSqft > 0
        ? Math.round((lotSqft / 43560) * 1000) / 1000
        : null;

    // Tax assessment + property tax — most recent year
    const taxAssess: Record<string, any> = p.taxAssessments ?? {};
    const propTax: Record<string, any> = p.propertyTaxes ?? {};
    const assessYears = Object.keys(taxAssess).sort().reverse();
    const taxYears = Object.keys(propTax).sort().reverse();
    const latestAssess = assessYears[0] ? taxAssess[assessYears[0]] : null;
    const latestTax = taxYears[0] ? propTax[taxYears[0]] : null;

    // Sale history: combine RentCast "history" object + listings into a unified timeline
    const saleHist: any[] = [];
    if (Array.isArray(saleListings)) {
      for (const l of saleListings) {
        if (l?.history && typeof l.history === "object") {
          for (const [date, evt] of Object.entries(l.history)) {
            saleHist.push({
              date,
              event: (evt as any)?.event ?? "Sale Listing",
              price: (evt as any)?.price ?? null,
              listingType: (evt as any)?.listingType ?? null,
              daysOnMarket: (evt as any)?.daysOnMarket ?? null,
            });
          }
        } else {
          saleHist.push({
            date: l?.listedDate ?? l?.createdDate ?? null,
            event: l?.status ?? "Sale Listing",
            price: l?.price ?? null,
            listingType: l?.listingType ?? null,
            daysOnMarket: l?.daysOnMarket ?? null,
            mlsNumber: l?.mlsNumber ?? null,
          });
        }
      }
      saleHist.sort((a, b) =>
        String(b.date ?? "").localeCompare(String(a.date ?? "")),
      );
    }

    // Rental history — same shape
    const rentalHist: any[] = [];
    if (Array.isArray(rentalListings)) {
      for (const l of rentalListings) {
        rentalHist.push({
          date: l?.listedDate ?? l?.createdDate ?? null,
          event: l?.status ?? "Rental Listing",
          price: l?.price ?? null,
          daysOnMarket: l?.daysOnMarket ?? null,
        });
      }
      rentalHist.sort((a, b) =>
        String(b.date ?? "").localeCompare(String(a.date ?? "")),
      );
    }

    // Market stats — only the Single Family slice if present
    let marketSlice: any = null;
    if (market?.saleData) {
      const saleAll = market.saleData;
      const sfSlice = (saleAll.dataByPropertyType ?? []).find(
        (s: any) => s.propertyType === "Single Family",
      );
      marketSlice = {
        zip: market.zipCode ?? zip,
        lastUpdated: saleAll.lastUpdatedDate ?? null,
        all: {
          medianPrice: saleAll.medianPrice ?? null,
          medianPricePerSqft: saleAll.medianPricePerSquareFoot ?? null,
          medianDom: saleAll.medianDaysOnMarket ?? null,
          totalListings: saleAll.totalListings ?? null,
          newListings: saleAll.newListings ?? null,
        },
        singleFamily: sfSlice
          ? {
              medianPrice: sfSlice.medianPrice ?? null,
              medianPricePerSqft: sfSlice.medianPricePerSquareFoot ?? null,
              medianDom: sfSlice.medianDaysOnMarket ?? null,
              totalListings: sfSlice.totalListings ?? null,
            }
          : null,
      };
    }

    res.json({
      identity: {
        address: p.formattedAddress ?? address,
        county: p.county ?? null,
        subdivision: p.subdivision ?? null,
        zoning: p.zoning ?? null,
        propertyType: p.propertyType ?? null,
        assessorId: p.assessorID ?? null,
      },
      facts: {
        sqft: p.squareFootage ?? null,
        beds: p.bedrooms ?? null,
        baths: p.bathrooms ?? null,
        yearBuilt: p.yearBuilt ?? null,
        lotSqft,
        lotAcres,
      },
      features: {
        architectureType: p.features?.architectureType ?? null,
        floorCount: p.features?.floorCount ?? null,
        exteriorType: p.features?.exteriorType ?? null,
        roofType: p.features?.roofType ?? null,
        cooling: p.features?.cooling ?? null,
        coolingType: p.features?.coolingType ?? null,
        heating: p.features?.heating ?? null,
        heatingType: p.features?.heatingType ?? null,
        garage: p.features?.garage ?? null,
        garageType: p.features?.garageType ?? null,
        fireplace: p.features?.fireplace ?? null,
        pool: p.features?.pool ?? null,
      },
      taxes: {
        latestAssessYear: assessYears[0] ?? null,
        latestAssessValue: latestAssess?.value ?? null,
        landValue: latestAssess?.land ?? null,
        improvementsValue: latestAssess?.improvements ?? null,
        latestTaxYear: taxYears[0] ?? null,
        latestTaxAmount: latestTax?.total ?? null,
        assessmentHistory: assessYears.map((y) => ({
          year: Number(y),
          value: taxAssess[y]?.value ?? null,
        })),
        taxHistory: taxYears.map((y) => ({
          year: Number(y),
          amount: propTax[y]?.total ?? null,
        })),
      },
      owner: p.owner
        ? {
            names: p.owner.names ?? [],
            type: p.owner.type ?? null,
            ownerOccupied: p.ownerOccupied ?? null,
            mailingAddress:
              p.owner.mailingAddress?.formattedAddress ?? null,
            absentee:
              p.owner.mailingAddress?.formattedAddress &&
              p.formattedAddress &&
              p.owner.mailingAddress.formattedAddress !== p.formattedAddress,
          }
        : null,
      rentEstimate: rentAvm
        ? {
            rent: rentAvm.rent ?? null,
            rentLow: rentAvm.rentRangeLow ?? null,
            rentHigh: rentAvm.rentRangeHigh ?? null,
          }
        : null,
      saleHistory: saleHist,
      rentalHistory: rentalHist,
      market: marketSlice,
      zoningRules: (() => {
        // Lookup bulk regs only for Anne Arundel County right now.
        const county = String(p.county ?? "").toLowerCase();
        if (!county.includes("anne arundel")) return null;
        const district = normalizeAaCountyDistrict(String(p.zoning ?? ""));
        if (!district) return null;
        const regs = ANNE_ARUNDEL_RESIDENTIAL[district];
        const coverageCapSqft =
          lotSqft && lotSqft > 0
            ? Math.round(lotSqft * (regs.maxLotCoveragePct / 100))
            : null;
        return {
          jurisdiction: "Anne Arundel County, MD",
          district: regs.district,
          description: regs.description,
          codeRef: regs.codeRef,
          minLotSizeSqft: regs.minLotSizeSqft,
          minFrontWidthFt: regs.minFrontWidthFt,
          maxLotCoveragePct: regs.maxLotCoveragePct,
          maxLotCoverageSqft: coverageCapSqft,
          maxHeightFt: regs.maxHeightFt,
          setbacks: regs.setbacks,
          notes: [
            "Standard subdivision (not cluster). Cluster setbacks differ.",
            "Critical Area buffer (~100ft from tidal waters) not included.",
            "Buildable envelope requires lot frontage/depth from a survey.",
          ],
        };
      })(),
    });
  });

  // ----- Market · ZIP Snapshot panel (v1.4.1.3) -----
  // RentCast-only: combines /markets (DOM, supply, listings, median list,
  // median sale) with a /listings/sale closed-sales count (status=Inactive,
  // last 30d) for a rigorous Months Supply denominator. ATTOM removed —
  // its key has been dead and RentCast's Oct 2024 sale-stats update covers
  // everything we used ATTOM for here. Never 500s; missing data → "—".
  app.get("/api/market/:zip", async (req: Request, res: Response) => {
    const zip = String(req.params.zip ?? "").trim();
    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({ error: "valid 5-digit ZIP required" });
    }

    // Keep `attom` in the shape for client compat (MarketStatsPanel reads it);
    // it's always false now — ATTOM is no longer used for this panel.
    type SourceFlags = { rentcast: boolean; attom: boolean };
    const source: SourceFlags = { rentcast: true, attom: false };

    // RentCast /markets — explicitly request 12 months of history so MoM
    // deltas are populated (history is on Foundation tier and up).
    // Typed errors mean "no data", flip the source flag.
    const marketP: Promise<any | null> = rcGet("markets", {
      zipCode: zip,
      historyRange: 12,
    }).catch((e) => {
      if (
        e instanceof RentCastAuthError ||
        e instanceof RentCastRateLimitError ||
        e instanceof RentCastUpstreamError
      ) {
        source.rentcast = false;
        return null;
      }
      console.warn("[market] rentcast error:", (e as Error).message);
      source.rentcast = false;
      return null;
    });

    // RentCast /listings/sale?status=Inactive — closed-sales feed.
    // We use lastSeenDate within the last 30 days as a closed-sale proxy.
    // Cap at 500 (API max); ZIP-level monthly volume in MD rarely exceeds that.
    const closedListingsP: Promise<any[] | null> = rcGet<any[]>("listings/sale", {
      zipCode: zip,
      status: "Inactive",
      limit: 500,
    }).catch((e) => {
      if (
        e instanceof RentCastAuthError ||
        e instanceof RentCastRateLimitError ||
        e instanceof RentCastUpstreamError
      ) {
        return null;
      }
      console.warn("[market] rentcast closed-sales error:", (e as Error).message);
      return null;
    });

    const [market, closedListings] = await Promise.all([marketP, closedListingsP]);

    // Current month (RentCast top-level saleData) + most-recent prior month
    // from saleData.history (keyed by YYYY-MM) for MoM deltas.
    // history[] includes the CURRENT month at index 0 when sorted desc; the
    // prior month for MoM math is index 1.
    const saleData: any = market?.saleData ?? null;
    const history: Record<string, any> = (saleData?.history && typeof saleData.history === "object")
      ? saleData.history
      : {};
    const histKeys = Object.keys(history).sort().reverse();
    const prevSnap: any = histKeys[1] ? history[histKeys[1]] : null;

    const num = (v: unknown): number | null => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const dom = num(saleData?.medianDaysOnMarket);
    const prevDom = num(prevSnap?.medianDaysOnMarket);
    // RentCast totalListings is CUMULATIVE (any-time-active in month), not
    // currently-active inventory. Apply ÷2 rough proxy for display.
    const totalRaw = num(saleData?.totalListings);
    const prevTotalRaw = num(prevSnap?.totalListings);
    const total = totalRaw != null ? Math.round(totalRaw / 2) : null;
    const prevTotal = prevTotalRaw != null ? Math.round(prevTotalRaw / 2) : null;
    const medList = num(saleData?.medianPrice);
    const prevMedList = num(prevSnap?.medianPrice);

    // ----- Median Sale (RentCast saleData.medianPrice) -----
    // RentCast's medianPrice on /markets is the median sale price across the
    // current dataset window (per their Oct 2024 sale-stats update). Prior
    // value from saleData.history for MoM delta.
    const medianSale = num(saleData?.medianPrice);
    const prevMedianSale = num(prevSnap?.medianPrice);

    // ----- Months Supply (industry standard) -----
    // = Currently Active Inventory / Monthly Closed Sales.
    // Numerator: `total` (÷2 proxy of cumulative totalListings).
    // Denominator: count of /listings/sale?status=Inactive whose lastSeenDate
    // falls within the last 30 days. Falls back to ÷2 of newListings as a
    // last resort if the closed-sales feed is unavailable.
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const countClosedLast30 = (rows: any[] | null | undefined): number | null => {
      if (!Array.isArray(rows)) return null;
      let c = 0;
      for (const r of rows) {
        const ts = r?.lastSeenDate ?? r?.removedDate ?? r?.lastSeen ?? null;
        if (typeof ts !== "string") continue;
        const t = Date.parse(ts);
        if (Number.isFinite(t) && now - t <= thirtyDaysMs) c++;
      }
      return c;
    };
    const closedCur = countClosedLast30(closedListings);
    const newListings = num(saleData?.newListings);
    const prevNewListings = num(prevSnap?.newListings);
    // Active inventory ÷ closed-last-30 = months of supply (rigorous).
    // Fallback: totalListings ÷ newListings (less accurate; same idea).
    const monthsSupply =
      total != null && closedCur != null && closedCur > 0
        ? Math.round((total / closedCur) * 10) / 10
        : total != null && newListings != null && newListings > 0
        ? Math.round((total / newListings) * 10) / 10
        : null;
    const prevMonthsSupply =
      prevTotal != null && prevNewListings != null && prevNewListings > 0
        ? Math.round((prevTotal / prevNewListings) * 10) / 10
        : null;

    const pctDelta = (cur: number | null, prev: number | null): number | null => {
      if (cur == null || prev == null || prev === 0) return null;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    };
    const diff = (cur: number | null, prev: number | null): number | null => {
      if (cur == null || prev == null) return null;
      return Math.round((cur - prev) * 10) / 10;
    };
    const intDiff = (cur: number | null, prev: number | null): number | null => {
      if (cur == null || prev == null) return null;
      return Math.round(cur - prev);
    };

    // Month label from RentCast lastUpdatedDate.
    let monthLabel = "";
    const lu = saleData?.lastUpdatedDate ?? null;
    if (typeof lu === "string") {
      const m = /^(\d{4})-(\d{2})/.exec(lu);
      if (m) {
        const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        monthLabel = `${months[Number(m[2]) - 1]} ${m[1].slice(-2)}`;
      }
    }

    res.json({
      zip,
      monthLabel: monthLabel || null,
      daysOnMarket: { value: dom, deltaDays: intDiff(dom, prevDom) },
      monthsSupply: { value: monthsSupply, delta: diff(monthsSupply, prevMonthsSupply) },
      activeListings: { value: total, delta: intDiff(total, prevTotal) },
      medianList: { value: medList, deltaPct: pctDelta(medList, prevMedList) },
      medianSale: {
        value: medianSale,
        deltaPct: pctDelta(medianSale, prevMedianSale),
      },
      source,
    });
  });

  // ----- Property details (best-effort via Nominatim + OSM) -----
  // The Census Geocoder does not return property attributes (beds/baths/sqft).
  // We attempt to enrich via Nominatim reverse geocoding for a tidy display address;
  // beds/baths/sqft are user-entered when public sources are unavailable.
  app.get("/api/property", async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "lat/lon required" });
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18&addressdetails=1`;
      const data: any = await fetchJson(url);
      res.json({
        displayName: data?.display_name ?? null,
        // Nominatim rarely returns beds/baths — we leave them null and let the user fill in
        beds: null,
        baths: null,
        sqft: null,
        yearBuilt: null,
      });
    } catch (e) {
      res.json({ displayName: null, beds: null, baths: null, sqft: null, yearBuilt: null });
    }
  });

  // ----- Site Intelligence (Critical Area + High School + Water + Sewer) -----
  // Returns four parallel GIS lookups for a given lat/lon. Critical Area is
  // limited to AACO (24003) + Calvert (24009) per scope; others are statewide MD.
  app.get("/api/site-intelligence", async (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "lat/lon required" });
    }

    const geom = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
    const common = `geometry=${geom}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&f=json`;

    // 1) Critical Area (MD iMap — AACO + Calvert)
    const criticalAreaUrl =
      `https://mdgeodata.md.gov/imap/rest/services/Environment/MD_CriticalAreas/FeatureServer/1/query?` +
      `outFields=Type,CritArea,Location&${common}`;

    // 2) High School zone (MDP ENOUGH Act layer 1, statewide)
    const hsUrl =
      `https://mdpgis.mdp.state.md.us/arcgis/rest/services/Society/ENOUGH_Act/FeatureServer/1/query?` +
      `outFields=SCHOOL_NAME,JURSCODE,SCHOOL_DISTRICT_NAME,SCHOOL_TYPE&` +
      `where=${encodeURIComponent("SCHOOL_TYPE='High'")}&${common}`;

    // 3) Water service area (EPA national PWS, filtered to MD primacy)
    const waterUrl =
      `https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0/query?` +
      `outFields=PWSID,PWS_Name,Primacy_Agency,Population_Served_Count,Service_Area_Type&` +
      `where=${encodeURIComponent("Primacy_Agency='MD'")}&${common}`;

    // 4) Sewer service (MDP Generalized Sewer, statewide)
    // Layer 0 was removed in an upstream MDP restructure (now returns HTTP 400).
    // The service now exposes the data on layer 2 "Sewer Service Status" with the
    // same field names, so we only need to repoint the layer id.
    const sewerUrl =
      `https://mdpgis.mdp.state.md.us/arcgis/rest/services/UtilitiesCommunication/Generalized_Sewer/MapServer/2/query?` +
      `outFields=JURSCODE,SERVCAT,GENZ_SWR,WWTP_SHED,SEWSTAT&${common}`;

    // Fetch one source with a hard timeout. A slow/dead upstream can never
    // freeze the whole panel: fetchJson aborts after 8s and we tag the source
    // so the tile degrades to "Lookup failed" instead of hanging Promise.all.
    const safe = async (url: string) => {
      const data: any = await fetchJson(url);
      if (data?.error) {
        throw new Error(data.error?.message ?? "Upstream error");
      }
      return data;
    };

    const settled = await Promise.allSettled([
      safe(criticalAreaUrl),
      safe(hsUrl),
      safe(waterUrl),
      safe(sewerUrl),
    ]);

    const sourceNames = ["criticalArea", "highSchool", "water", "sewer"] as const;
    const unwrap = (i: number) => {
      const r = settled[i];
      if (r.status === "fulfilled") return r.value;
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.warn("[site-intel] source failed", sourceNames[i], reason);
      return { error: reason };
    };
    const [ca, hs, water, sewer] = [unwrap(0), unwrap(1), unwrap(2), unwrap(3)];
    const allFailed = settled.every((r) => r.status === "rejected");
    if (allFailed) {
      return res.status(500).json({ error: "All site-intelligence sources failed" });
    }

    // ----- Critical Area normalization -----
    // Coverage check: AACO and Calvert only. We infer county from HS or sewer JURSCODE
    // (returned in those queries) since CA layer doesn't include a clean county code.
    const hsJurs = hs?.features?.[0]?.attributes?.JURSCODE as string | undefined;
    const sewerJurs = sewer?.features?.[0]?.attributes?.JURSCODE as string | undefined;
    const jurs = hsJurs || sewerJurs;
    // MD JURSCODE (MDP layers use 4-letter codes). Critical Area data itself only
    // covers Anne Arundel + Calvert (the MD_CriticalAreas service). Water/sewer
    // (well/septic) coverage is broader — v1.6.0 recognizes AACO, Calvert, Prince
    // George's, Montgomery, Howard, and Charles (see MD_GIS_SCOPE).
    const inCriticalAreaScope = jurs === "ANNE" || jurs === "CALV";
    const inWaterSewerScope = jurs != null && jurs in MD_GIS_SCOPE;
    const scopeCounty = jurs ? MD_GIS_SCOPE[jurs] ?? null : null;
    let criticalArea: any;
    if (ca?.error) {
      criticalArea = { state: "unknown", label: "Lookup failed", meta: ca.error };
    } else if (!inCriticalAreaScope) {
      criticalArea = {
        state: "out-of-scope",
        label: "Not in coverage area",
        meta: "Coverage: Anne Arundel + Calvert only",
        scope: "AACO+Calvert",
      };
    } else if (!ca?.features?.length) {
      criticalArea = {
        state: "ok",
        label: "Not in Critical Area",
        meta: "Standard zoning only",
        scope: "AACO+Calvert",
      };
    } else {
      const t = (ca.features[0].attributes?.Type ?? "").toString().toUpperCase();
      const map: Record<string, { state: string; label: string }> = {
        IDA: { state: "info", label: "IDA — Intensely Developed Area" },
        LDA: { state: "warn", label: "LDA — Limited Development Area" },
        RCA: { state: "stop", label: "RCA — Resource Conservation Area" },
      };
      const hit = map[t] ?? { state: "info", label: `Critical Area: ${t}` };
      criticalArea = {
        ...hit,
        meta: "Screening only — confirm with AACO Critical Area Planner (410) 222-7960",
        scope: "AACO+Calvert",
      };
    }

    // ----- High School -----
    let highSchool: any;
    if (hs?.error) {
      highSchool = { state: "unknown", label: "Lookup failed", meta: hs.error };
    } else if (!hs?.features?.length) {
      highSchool = {
        state: "unknown",
        label: "Zone not found",
        meta: "Outside MD or city of Baltimore (uses school choice)",
      };
    } else {
      const a = hs.features[0].attributes ?? {};
      const name = (a.SCHOOL_NAME as string) || "Unknown";
      const district = (a.SCHOOL_DISTRICT_NAME as string) || "";
      highSchool = {
        state: "info",
        label: name,
        meta: district,
      };
    }

    // ----- Water -----
    let waterPanel: any;
    if (water?.error) {
      waterPanel = { state: "unknown", label: "Lookup failed", meta: water.error };
    } else if (!water?.features?.length) {
      waterPanel = {
        state: "warn",
        label: "Likely private well",
        meta: "No public water service polygon at this point",
      };
    } else {
      const a = water.features[0].attributes ?? {};
      const name = (a.PWS_Name as string) || "Public water";
      const pop = a.Population_Served_Count as number | undefined;
      waterPanel = {
        state: "ok",
        label: name,
        meta: pop ? `Serves ~${pop.toLocaleString()} people` : "Public water service",
      };
    }

    // ----- Sewer -----
    let sewerPanel: any;
    if (sewer?.error) {
      sewerPanel = { state: "unknown", label: "Lookup failed", meta: sewer.error };
    } else if (!sewer?.features?.length) {
      sewerPanel = {
        state: "warn",
        label: "Septic — No planned service",
        meta: "Outside any planned sewer envelope",
      };
    } else {
      const a = sewer.features[0].attributes ?? {};
      const code = (a.GENZ_SWR as string) || "";
      const wwtp = (a.WWTP_SHED as string) || "";
      const codeMap: Record<string, { state: string; label: string }> = {
        EXIS: { state: "ok", label: "Existing sewer service" },
        FUT: { state: "info", label: "Future planned sewer" },
        PLA: { state: "info", label: "Planned sewer (future)" },
        NOP: { state: "warn", label: "No planned sewer" },
      };
      const hit = codeMap[code] ?? { state: "info", label: code || "Sewer category" };
      sewerPanel = {
        ...hit,
        meta: wwtp ? `Watershed: ${wwtp}` : "Public sewer category",
      };
    }

    res.json({
      criticalArea,
      highSchool,
      water: waterPanel,
      sewer: sewerPanel,
      coverage: {
        county: scopeCounty,
        inWaterSewerScope,
        counties: Object.values(MD_GIS_SCOPE),
      },
    });
  });

  // ----- ATTOM: distress + ownership (auth-required) -----
  // ATTOM complements RentCast with deeper public-records depth: pre-foreclosure
  // / NOD / lis pendens / auction / REO flags, full deed history, and mortgage
  // records. Cached server-side. When ATTOM_API_KEY is not configured both
  // endpoints return 503 so the deploy stays healthy until the user adds a key.
  function handleAttomError(e: unknown, res: Response): void {
    if (e instanceof KeyMissingError) {
      res.status(503).json({
        error: "ATTOM data provider not configured",
        detail: "Set ATTOM_API_KEY in environment to enable distress + ownership data",
      });
      return;
    }
    if (e instanceof UpstreamError) {
      if (e.status === 404) {
        res.status(404).json({ error: e.message });
        return;
      }
      res.status(e.status).json({ error: e.message });
      return;
    }
    console.error("[attom] unexpected error", e);
    res.status(500).json({ error: "ATTOM lookup failed" });
  }

  app.get("/api/property/distress", requireAuth, async (req, res) => {
    const address = String(req.query.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });
    try {
      const result = await getDistress(address);
      res.json(result);
    } catch (e) {
      handleAttomError(e, res);
    }
  });

  app.get("/api/property/ownership", requireAuth, async (req, res) => {
    const address = String(req.query.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });
    try {
      const result = await getOwnership(address);
      res.json(result);
    } catch (e) {
      handleAttomError(e, res);
    }
  });

  // ----- Deals CRUD (auth-required, scoped to current user) -----
  app.get("/api/deals", requireAuth, async (req, res) => {
    const userId = (req as any).userId as number;
    res.json(await storage.listDeals(userId));
  });

  app.get("/api/deals/:id", requireAuth, async (req, res) => {
    const userId = (req as any).userId as number;
    const id = Number(req.params.id);
    const deal = await storage.getDeal(id, userId);
    if (!deal) return res.status(404).json({ error: "Not found" });
    // Bump last_opened_at — fire-and-forget, doesn't affect the response payload.
    // We don't await so a slow disk write can't block the GET.
    void storage.touchDeal(id, userId).catch(() => {});
    res.json(deal);
  });

  app.post("/api/deals", requireAuth, async (req, res) => {
    const userId = (req as any).userId as number;
    const parsed = insertDealSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const deal = await storage.createDeal(userId, parsed.data);
    res.status(201).json(deal);
  });

  app.patch("/api/deals/:id", requireAuth, async (req, res) => {
    const userId = (req as any).userId as number;
    const id = Number(req.params.id);
    const parsed = insertDealSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const deal = await storage.updateDeal(id, userId, parsed.data);
    if (!deal) return res.status(404).json({ error: "Not found" });
    res.json(deal);
  });

  app.delete("/api/deals/:id", requireAuth, async (req, res) => {
    const userId = (req as any).userId as number;
    const id = Number(req.params.id);
    const ok = await storage.deleteDeal(id, userId);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  });

  // ──────────────────────────────────────────────────────────────────────
  // POST /api/email/deal-pdf  — email a generated deal PDF as attachment
  // Auth-gated. Per-user rate limit: 20/hour.
  // ──────────────────────────────────────────────────────────────────────
  const EMAIL_RATE: Map<number, number[]> = new Map();
  const EMAIL_LIMIT = 20;
  const EMAIL_WINDOW_MS = 60 * 60 * 1000; // 1 hour

  function checkEmailRate(userId: number): { ok: boolean; retryInMin?: number } {
    const now = Date.now();
    const arr = (EMAIL_RATE.get(userId) ?? []).filter(
      (t) => now - t < EMAIL_WINDOW_MS,
    );
    if (arr.length >= EMAIL_LIMIT) {
      const earliest = arr[0];
      const retryInMin = Math.max(
        1,
        Math.ceil((EMAIL_WINDOW_MS - (now - earliest)) / 60000),
      );
      EMAIL_RATE.set(userId, arr);
      return { ok: false, retryInMin };
    }
    arr.push(now);
    EMAIL_RATE.set(userId, arr);
    return { ok: true };
  }

  function isLikelyEmail(s: unknown): s is string {
    return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  app.post("/api/email/deal-pdf", requireAuth, async (req, res) => {
    const userId = (req as any).userId as number;
    const {
      to,
      ccSelf,
      subject,
      message,
      pdfBase64,
      filename,
    } = (req.body ?? {}) as {
      to?: string;
      ccSelf?: boolean;
      subject?: string;
      message?: string;
      pdfBase64?: string;
      filename?: string;
    };

    if (!isLikelyEmail(to)) {
      return res.status(400).json({ ok: false, error: "Invalid recipient email" });
    }
    if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Subject required" });
    }
    if (
      !pdfBase64 ||
      typeof pdfBase64 !== "string" ||
      pdfBase64.length < 100
    ) {
      return res.status(400).json({ ok: false, error: "Missing PDF" });
    }
    // Cap attachment at ~10MB raw (~14MB base64)
    if (pdfBase64.length > 14 * 1024 * 1024) {
      return res.status(413).json({ ok: false, error: "Attachment too large" });
    }
    const fname =
      filename && /^[\w\-. ]+\.pdf$/i.test(filename)
        ? filename
        : "deal-memo.pdf";

    const rate = checkEmailRate(userId);
    if (!rate.ok) {
      return res.status(429).json({
        ok: false,
        error: `Rate limit reached (${EMAIL_LIMIT}/hr). Try again in ${rate.retryInMin} min.`,
      });
    }

    let cc: string | undefined;
    let userEmail: string | undefined;
    try {
      const user = await storage.getUserById(userId);
      userEmail = user?.email ?? undefined;
      if (ccSelf && userEmail) cc = userEmail;
    } catch {
      /* non-fatal */
    }

    const safeMsg = escapeHtml((message ?? "").trim());
    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f8f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0a0e12;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:18px;font-weight:600;letter-spacing:-0.01em;margin-bottom:24px;">
      PropBox<span style="color:#126D85">IQ</span>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <p style="margin:0 0 12px 0;font-size:14px;line-height:1.55;white-space:pre-wrap;">${safeMsg || "See attached deal memo."}</p>
      <p style="margin:24px 0 0 0;font-size:12px;color:#6b7280;">Attached: ${escapeHtml(fname)}</p>
    </div>
    <p style="margin:24px 0 0 0;font-size:11px;color:#9ca3af;text-align:center;">Sent via PropBoxIQ${userEmail ? ` by ${escapeHtml(userEmail)}` : ""}</p>
  </div>
</body></html>`;
    const text = `${(message ?? "").trim() || "See attached deal memo."}\n\nAttached: ${fname}\n\nSent via PropBoxIQ${userEmail ? ` by ${userEmail}` : ""}`;

    const result = await sendEmailWithAttachment({
      to: to.trim(),
      cc,
      replyTo: userEmail,
      subject: subject.trim(),
      html,
      text,
      attachment: {
        filename: fname,
        contentBase64: pdfBase64,
        contentType: "application/pdf",
      },
    });

    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error ?? "Send failed" });
    }
    return res.json({ ok: true });
  });

  return httpServer;
}
