// Static "Comparable Location Map" panel for the institutional Comp Hero PDF
// (v1.7.5). Tries Mapbox Static Images API first, then Google Static Maps,
// and if neither API key is configured, falls back to a hand-drawn inline
// SVG map (a simplified county/road sketch with a lat/lon → local-pixel
// projection) so the PDF never crashes or ships a blank panel just because a
// map API key hasn't been provisioned yet.
//
// Subject pin: navy #0a0e12 with "SUBJECT" label. Comp pins: muted gold
// #a68a3f, numbered 1-N matching the comp grid order.

const GOLD = "#a68a3f";
const NAVY = "#0a0e12";

export interface MapPoint {
  lat: number;
  lon: number;
  label: string; // "SUBJECT" or "1".."4"
  isSubject: boolean;
}

const MAP_W = 260;
const MAP_H = 175;

// Returns an <img src="..."> compatible URL (remote static-map API) OR an
// inline data:image/svg+xml URL (fallback). Either way the caller just drops
// the result into an <img> tag — no branching needed at the call site.
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

  const mapboxToken = process.env.MAPBOX_TOKEN || process.env.MAPBOX_ACCESS_TOKEN;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_STATIC_MAPS_API_KEY;

  if (mapboxToken) {
    const url = buildMapboxUrl(validPoints, mapboxToken);
    if (url) return { src: url, isFallback: false };
  }
  if (googleKey) {
    const url = buildGoogleStaticMapUrl(validPoints, googleKey);
    if (url) return { src: url, isFallback: false };
  }

  return { src: renderFallbackSvg(validPoints), isFallback: true };
}

function buildMapboxUrl(points: MapPoint[], token: string): string | null {
  // mapbox-gl static image API: pin markers via "pin-s-l+hexcolor(lon,lat)"
  const markers = points
    .map((p) => {
      const color = p.isSubject ? NAVY.replace("#", "") : GOLD.replace("#", "");
      const label = p.isSubject ? "" : `-${p.label}`; // mapbox only supports single char/number labels reliably
      return `pin-s${label}+${color}(${p.lon},${p.lat})`;
    })
    .join(",");
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markers}/auto/${MAP_W}x${MAP_H}@2x?padding=30&access_token=${token}`;
}

function buildGoogleStaticMapUrl(points: MapPoint[], key: string): string | null {
  const subject = points.find((p) => p.isSubject);
  const comps = points.filter((p) => !p.isSubject);
  const params = new URLSearchParams({
    size: `${MAP_W}x${MAP_H}`,
    scale: "2",
    maptype: "roadmap",
    key,
  });
  if (subject) {
    params.append("markers", `color:0x0a0e12|label:S|${subject.lat},${subject.lon}`);
  }
  for (const c of comps) {
    params.append("markers", `color:0xa68a3f|label:${c.label}|${c.lat},${c.lon}`);
  }
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
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
            <circle cx="${p.x}" cy="${p.y}" r="7" fill="${NAVY}" stroke="#ffffff" stroke-width="1.5" />
            <rect x="${p.x - 22}" y="${p.y + 10}" width="44" height="13" rx="2" fill="${NAVY}" />
            <text x="${p.x}" y="${p.y + 19.5}" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="0.05em">SUBJECT</text>
          </g>`;
      }
      return `
        <g>
          <circle cx="${p.x}" cy="${p.y}" r="9" fill="${GOLD}" stroke="#ffffff" stroke-width="1.5" />
          <text x="${p.x}" y="${p.y + 3.2}" font-family="Inter, sans-serif" font-size="9.5" font-weight="700" fill="#ffffff" text-anchor="middle">${p.label}</text>
        </g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">
    <rect width="${MAP_W}" height="${MAP_H}" fill="#f2eee1" />
    ${roads}
    ${pins}
    <rect x="0.5" y="0.5" width="${MAP_W - 1}" height="${MAP_H - 1}" fill="none" stroke="${GOLD}" stroke-width="1" />
  </svg>`;

  const base64 = Buffer.from(svg, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}
