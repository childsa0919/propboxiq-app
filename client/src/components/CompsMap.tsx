import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type CompPin = {
  id: string;
  address: string;
  price: number;
  sqft: number | null;
  pricePerSqft: number | null;
  distance: number;
  lat: number | null;
  lon: number | null;
  isTop: boolean; // is in top-4 used for ARV
  excluded: boolean; // user excluded this comp
};

type Props = {
  subject: { lat: number | null; lon: number | null; address: string };
  comps: CompPin[];
  /** Search radius in miles for the dotted overlay circle. */
  radiusMiles: number | null;
  className?: string;
};

const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function milesToMeters(mi: number) {
  return mi * 1609.344;
}

/**
 * Build a small inline SVG numbered pin used as a Leaflet divIcon. We use
 * inline SVG instead of image assets so the bundle stays tiny and we can
 * theme the colors at runtime.
 */
function pinIcon(opts: {
  label: string;
  fill: string;
  stroke: string;
  textColor: string;
  size?: number;
  excluded?: boolean;
}): L.DivIcon {
  const size = opts.size ?? 32;
  const opacity = opts.excluded ? 0.4 : 1;
  const html = `
    <div style="opacity:${opacity};filter:${opts.excluded ? "grayscale(1)" : "none"};">
      <svg width="${size}" height="${size + 6}" viewBox="0 0 32 38" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <path d="M16 0 C7.2 0 0 7.2 0 16 C0 26 16 38 16 38 C16 38 32 26 32 16 C32 7.2 24.8 0 16 0 Z"
              fill="${opts.fill}" stroke="${opts.stroke}" stroke-width="1.5"/>
        <text x="16" y="20" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
              font-size="13" font-weight="700" fill="${opts.textColor}">${opts.label}</text>
        ${opts.excluded ? '<line x1="6" y1="6" x2="26" y2="26" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>' : ""}
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: "comps-map-pin",
    iconSize: [size, size + 6],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -size],
  });
}

function subjectIcon(): L.DivIcon {
  // House silhouette pin — clearly distinct from numbered comp pins.
  const size = 38;
  const html = `
    <div>
      <svg width="${size}" height="${size + 6}" viewBox="0 0 32 38" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <path d="M16 0 C7.2 0 0 7.2 0 16 C0 26 16 38 16 38 C16 38 32 26 32 16 C32 7.2 24.8 0 16 0 Z"
              fill="#0a0e12" stroke="#5fd4e7" stroke-width="2"/>
        <path d="M16 7 L23 13 L23 22 L9 22 L9 13 Z" fill="#5fd4e7"/>
        <rect x="13.5" y="16" width="5" height="6" fill="#0a0e12"/>
      </svg>
    </div>`;
  return L.divIcon({
    html,
    className: "comps-map-pin comps-map-subject-pin",
    iconSize: [size, size + 6],
    iconAnchor: [size / 2, size + 6],
    popupAnchor: [0, -size],
  });
}

export function CompsMap({ subject, comps, radiusMiles, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false, // mobile-friendly: only pinch-zoom by default
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Re-enable scroll-wheel zoom only when the user explicitly clicks the map.
    map.on("focus", () => map.scrollWheelZoom.enable());
    map.on("blur", () => map.scrollWheelZoom.disable());

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Render pins/circle whenever data changes.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const points: L.LatLngExpression[] = [];

    if (subject.lat != null && subject.lon != null) {
      points.push([subject.lat, subject.lon]);
      L.marker([subject.lat, subject.lon], { icon: subjectIcon(), zIndexOffset: 1000 })
        .bindPopup(
          `<div style="font-family:-apple-system,sans-serif;font-size:12px;">
            <div style="font-weight:700;color:#0a0e12;">Subject</div>
            <div style="color:#3a4452;">${escapeHtml(subject.address)}</div>
          </div>`,
        )
        .addTo(layer);

      // Draw dotted radius circle if we have a radius
      if (radiusMiles && radiusMiles > 0) {
        L.circle([subject.lat, subject.lon], {
          radius: milesToMeters(radiusMiles),
          color: "#126D85",
          weight: 1.5,
          opacity: 0.55,
          fillColor: "#126D85",
          fillOpacity: 0.05,
          dashArray: "4 6",
          interactive: false,
        }).addTo(layer);
      }
    }

    let labelN = 1;
    for (const c of comps) {
      if (c.lat == null || c.lon == null) continue;
      const fill = c.isTop ? "#126D85" : "#ffffff";
      const stroke = c.isTop ? "#0a3d4a" : "#126D85";
      const textColor = c.isTop ? "#ffffff" : "#126D85";
      const label = String(labelN++);
      const marker = L.marker([c.lat, c.lon], {
        icon: pinIcon({
          label,
          fill,
          stroke,
          textColor,
          excluded: c.excluded,
        }),
        zIndexOffset: c.isTop ? 500 : 0,
      });
      const ppsf = c.pricePerSqft ? `$${c.pricePerSqft}/sqft` : "—";
      const sqft = c.sqft ? `${c.sqft.toLocaleString()} sqft` : "—";
      marker.bindPopup(
        `<div style="font-family:-apple-system,sans-serif;font-size:12px;min-width:180px;">
          <div style="font-weight:700;color:#0a0e12;">${escapeHtml(c.address)}</div>
          <div style="color:#3a4452;margin-top:2px;">${fmtUSD(c.price)} · ${ppsf}</div>
          <div style="color:#6e7780;margin-top:2px;font-size:11px;">${sqft} · ${c.distance.toFixed(2)} mi away</div>
          ${c.excluded ? '<div style="color:#ef4444;margin-top:4px;font-weight:600;font-size:11px;">EXCLUDED FROM ARV</div>' : c.isTop ? '<div style="color:#126D85;margin-top:4px;font-weight:700;font-size:10px;letter-spacing:0.06em;">USED FOR ARV</div>' : ""}
        </div>`,
      );
      marker.addTo(layer);
      if (!c.excluded) points.push([c.lat, c.lon]);
    }

    // Fit bounds to all (non-excluded) points with a little padding.
    if (points.length >= 2) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0] as L.LatLngExpression, 15);
    } else {
      // No coords at all — set a generic US-wide view.
      map.setView([39.5, -76.6], 11);
    }
  }, [
    subject.lat,
    subject.lon,
    subject.address,
    comps,
    radiusMiles,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="comps-map"
      style={{
        width: "100%",
        height: "300px",
        borderRadius: "0.75rem",
        overflow: "hidden",
        background: "#0a0e12",
      }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
