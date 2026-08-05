// Static "Comparable Location Map" panel for the institutional Comp Hero PDF
// (v1.7.6). Fetches a real Mapbox Static Images API PNG server-side and
// inlines it as a base64 data: URI (safer than letting Puppeteer fetch a
// remote image live — no dependency on network access at render time, no
// risk of the render stalling on a slow/hanging map request). If
// MAPBOX_ACCESS_TOKEN isn't configured, or the fetch fails/times out for any
// reason, falls back to the pre-existing hand-drawn inline SVG sketch map
// (a simplified road sketch with a lat/lon → local-pixel projection) so the
// PDF never crashes or ships a blank panel just because a map API key hasn't
// been provisioned yet.
//
// Style: light-v11 — a dark map style would clash with the cream/gold
// institutional palette, so we pin to the light theme intentionally.
// Subject pin: navy #0a0e12, labeled "house". Comp pins: muted gold
// #a68a3f, numbered 1-N matching the comp grid order.

const GOLD = "a68a3f";
const NAVY = "0a0e12";

export interface MapPoint {
  lat: number;
  lon: number;
  label: string; // "SUBJECT" or "1".."N"
  isSubject: boolean;
}

const MAP_W = 260;
const MAP_H = 175;
const MAP_FETCH_TIMEOUT_MS = 10_000;

// Returns an <img src="..."> compatible data: URI — either a real Mapbox PNG
// (base64-inlined) or the inline SVG fallback. Either way the caller just
// drops the result into an <img> tag — no branching needed at the call site.
export async function getComparableMapImageSrc(points: MapPoint[]): Promise<{
  src: string;
  isFallback: boolean;
}> {
  const validPoints = points.filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0 && p.lon !== 0,
  );

  if (validPoints.length === 0) {
    return { src: renderFallbackSvg([]), isFallback: true };
  }

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;

  if (mapboxToken) {
    try {
      const dataUri = await fetchMapboxStaticImage(validPoints, mapboxToken);
      if (dataUri) return { src: dataUri, isFallback: false };
    } catch (err) {
      console.warn("[compHeroPdf] Mapbox static map fetch failed, falling back to SVG sketch map:", err);
    }
  } else {
    console.warn("[compHeroPdf] MAPBOX_ACCESS_TOKEN not set — using SVG sketch-map fallback.");
  }

  return { src: renderFallbackSvg(validPoints), isFallback: true };
}

// Builds the Mapbox Static Images API URL. Marker syntax:
//   pin-l-house+0a0e12(lon,lat)   — subject, navy, "house" glyph label
//   pin-l-1+a68a3f(lon,lat)       — comp 1, gold, numeral label
//   ...
//   pin-l-N+a68a3f(lon,lat)
// followed by /auto/WxH@2x to auto-fit bounds around all pins with padding,
// at 2x scale for retina print quality.
export function buildMapboxUrl(points: MapPoint[], token: string): string {
  const markers = points
    .map((p) => {
      const color = p.isSubject ? NAVY : GOLD;
      const label = p.isSubject ? "house" : p.label;
      return `pin-l-${label}+${color}(${p.lon},${p.lat})`;
    })
    .join(",");
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markers}/auto/${MAP_W}x${MAP_H}@2x?access_token=${token}`;
}

async function fetchMapboxStaticImage(points: MapPoint[], token: string): Promise<string | null> {
  const url = buildMapboxUrl(points, token);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAP_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[compHeroPdf] Mapbox static map returned HTTP ${res.status}`);
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  } finally {
    clearTimeout(timeout);
  }
}

// Hand-drawn SVG fallback: projects lat/lon into the panel's pixel box with a
// simple equirectangular fit (fine at this scale — comps are all within a
// few miles), draws a cream basemap with a few sketch roads, then places
// numbered pins. Returned as a data: URI so it drops straight into <img src>.
function renderFallbackSvg(points: MapPoint[]): string {
  const pad = 28;
  let projected: { x: number; y: number; label: string; isSubject: boolean }[] = [];

  if (points.length > 0) {
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const latSpan = Math.max(maxLat - minLat, 0.01);
    const lonSpan = Math.max(maxLon - minLon, 0.01);

    projected = points.map((p) => {
      const x = pad + ((p.lon - minLon) / lonSpan) * (MAP_W - pad * 2);
      // lat increases north; SVG y increases downward, so invert.
      const y = pad + (1 - (p.lat - minLat) / latSpan) * (MAP_H - pad * 2);
      return { x, y, label: p.label, isSubject: p.isSubject };
    });
  }

  const roads = `
    <path d="M -10 60 L 290 40" stroke="#e3ddc8" stroke-width="3" fill="none" />
    <path d="M -10 150 L 290 170" stroke="#e3ddc8" stroke-width="3" fill="none" />
    <path d="M 90 -10 L 70 230" stroke="#e3ddc8" stroke-width="2.5" fill="none" />
    <path d="M 210 -10 L 230 230" stroke="#e3ddc8" stroke-width="2.5" fill="none" />
  `;

  const pins = projected
    .map((p) => {
      if (p.isSubject) {
        return `
          <g>
            <circle cx="${p.x}" cy="${p.y}" r="7" fill="#${NAVY}" stroke="#ffffff" stroke-width="1.5" />
            <rect x="${p.x - 22}" y="${p.y + 10}" width="44" height="13" rx="2" fill="#${NAVY}" />
            <text x="${p.x}" y="${p.y + 19.5}" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="0.05em">SUBJECT</text>
          </g>`;
      }
      return `
        <g>
          <circle cx="${p.x}" cy="${p.y}" r="9" fill="#${GOLD}" stroke="#ffffff" stroke-width="1.5" />
          <text x="${p.x}" y="${p.y + 3.2}" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#ffffff" text-anchor="middle">${p.label}</text>
        </g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">
    <rect width="${MAP_W}" height="${MAP_H}" fill="#f2eee1" />
    ${roads}
    ${pins}
    <rect x="0.5" y="0.5" width="${MAP_W - 1}" height="${MAP_H - 1}" fill="none" stroke="#${GOLD}" stroke-width="1" />
  </svg>`;

  const base64 = Buffer.from(svg, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}
