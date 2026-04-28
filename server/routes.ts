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
  TIMINGS,
} from "./auth";

// Census Geocoder — free, no key, US addresses
const CENSUS_BASE =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": "FlipAnalyzer/1.0 (real estate deal analyzer)",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
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
  app.post("/api/auth/request", async (req: Request, res: Response) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
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
    const user = await storage.upsertUser(consumed.email);
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

      const user = await storage.upsertUser(profile.email, profile.name ?? null);
      await storage.touchLogin(user.id);
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
  // ----- Address autocomplete (Census Geocoder) -----
  app.get("/api/geocode", async (req: Request, res: Response) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 4) {
      return res.json({ matches: [] });
    }
    try {
      const url = `${CENSUS_BASE}?address=${encodeURIComponent(
        q
      )}&benchmark=Public_AR_Current&format=json`;
      const data: any = await fetchJson(url);
      const matches = (data?.result?.addressMatches ?? []).map((m: any) => ({
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

    const apiKey = process.env.RENTCAST_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "RentCast API key not configured" });
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
    };

    let subjectSqft: number | null = null;
    let subjectAddress: string | null = null;
    let usedRadius: number | null = null;
    let comps: Comp[] = [];
    let lastError: string | null = null;

    for (const radius of RADII) {
      try {
        const url =
          `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(
            address,
          )}&radius=${radius}&daysOld=${DAYS_OLD}&compCount=25`;
        const data: any = await fetchJson(url, {
          headers: { "X-Api-Key": apiKey },
        });

        const sp = data?.subjectProperty ?? {};
        subjectSqft = (sp.squareFootage as number | undefined) ?? subjectSqft;
        subjectAddress = (sp.formattedAddress as string | undefined) ?? subjectAddress;

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
        lastError = e?.message ?? "RentCast lookup failed";
      }
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

    // ARV strategy: take the 4 highest comps by total sale price, average their $/sqft,
    // multiply by post-rehab target sqft (or subject sqft if no target). This anchors
    // ARV on the strongest finished-product comps in the area — a flipper expects to
    // sell at the top of the comp range after a quality rehab.
    const mean = (arr: number[]) =>
      arr.length === 0 ? 0 : Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    // Top 4 by sale price (descending). If <4 comps, use whatever we have.
    const topComps = [...comps]
      .sort((a, b) => b.price - a.price)
      .slice(0, 4);

    const topPpsfList = topComps
      .map((c) => c.pricePerSqft)
      .filter((n): n is number => n != null);
    const meanTopPpsf = mean(topPpsfList);
    const meanTopPrice = mean(topComps.map((c) => c.price));

    // Reference numbers for the response (across ALL comps, for context)
    const medianPpsf = mean(
      comps.map((c) => c.pricePerSqft).filter((n): n is number => n != null)
    );

    // ARV multiplies mean(top-4 $/sqft) by the post-rehab target sqft when provided
    // (the buyer is buying the finished house, not the as-is footprint).
    const arvSqft = targetSqft ?? subjectSqft;
    let arv = 0;
    if (arvSqft && meanTopPpsf) {
      arv = Math.round(arvSqft * meanTopPpsf);
    } else {
      // Sqft missing on subject — fall back to mean of the top-4 sale prices directly
      arv = meanTopPrice;
    }

    // Confidence band — ±10% if we have <6 comps, ±7% otherwise
    const band = comps.length >= 6 ? 0.07 : 0.1;
    const arvLow = Math.round(arv * (1 - band));
    const arvHigh = Math.round(arv * (1 + band));

    res.json({
      subject: {
        address: subjectAddress ?? address,
        sqft: subjectSqft,
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
      arvAnchorPpsf: meanTopPpsf || null,
      arvTopCompIds: topComps.map((c) => c.id),
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

  // ----- Subject property facts via RentCast (cheap lookup) -----
  // Returns sqft / beds / baths / yearBuilt for the address so we can prefill
  // the post-rehab spec inputs with the as-is footprint.
  app.get("/api/property/lookup", async (req: Request, res: Response) => {
    const address = String(req.query.address ?? "").trim();
    if (!address) return res.status(400).json({ error: "address required" });
    const apiKey = process.env.RENTCAST_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "RentCast API key not configured" });
    }
    try {
      const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(
        address,
      )}`;
      const data: any = await fetchJson(url, {
        headers: { "X-Api-Key": apiKey },
      });
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
    const apiKey = process.env.RENTCAST_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "RentCast API key not configured" });
    }
    const headers = { "X-Api-Key": apiKey };
    const enc = encodeURIComponent(address);

    // Helper: fetch JSON and swallow 404s as null (so one missing source doesn't fail the whole call).
    const safe = async <T,>(url: string): Promise<T | null> => {
      try {
        return (await fetchJson(url, { headers })) as T;
      } catch {
        return null;
      }
    };

    const [property, rentAvm, saleListings, rentalListings, market] =
      await Promise.all([
        safe<any>(`https://api.rentcast.io/v1/properties?address=${enc}`),
        safe<any>(
          `https://api.rentcast.io/v1/avm/rent/long-term?address=${enc}`,
        ),
        safe<any>(`https://api.rentcast.io/v1/listings/sale?address=${enc}`),
        safe<any>(
          `https://api.rentcast.io/v1/listings/rental/long-term?address=${enc}`,
        ),
        zip
          ? safe<any>(`https://api.rentcast.io/v1/markets?zipCode=${zip}`)
          : Promise.resolve(null),
      ]);

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
    const sewerUrl =
      `https://mdpgis.mdp.state.md.us/arcgis/rest/services/UtilitiesCommunication/Generalized_Sewer/MapServer/0/query?` +
      `outFields=JURSCODE,SERVCAT,GENZ_SWR,WWTP_SHED,SEWSTAT&${common}`;

    const safe = async (url: string) => {
      try {
        const data: any = await fetchJson(url);
        if (data?.error) return { error: data.error?.message ?? "Upstream error" };
        return data;
      } catch (e: any) {
        return { error: e?.message ?? "Fetch failed" };
      }
    };

    const [ca, hs, water, sewer] = await Promise.all([
      safe(criticalAreaUrl),
      safe(hsUrl),
      safe(waterUrl),
      safe(sewerUrl),
    ]);

    // ----- Critical Area normalization -----
    // Coverage check: AACO and Calvert only. We infer county from HS or sewer JURSCODE
    // (returned in those queries) since CA layer doesn't include a clean county code.
    const hsJurs = hs?.features?.[0]?.attributes?.JURSCODE as string | undefined;
    const sewerJurs = sewer?.features?.[0]?.attributes?.JURSCODE as string | undefined;
    const jurs = hsJurs || sewerJurs;
    // MD JURSCODE (MDP layers use 4-letter codes): ANNE = Anne Arundel, CALV = Calvert
    const inCriticalAreaScope = jurs === "ANNE" || jurs === "CALV";
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
    });
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

  return httpServer;
}
