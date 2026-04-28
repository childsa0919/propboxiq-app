interface Props {
  lat: number;
  lon: number;
  className?: string;
  zoom?: number;
}

// Static OSM tile preview. No JS lib required — just embeds the standard
// OpenStreetMap export iframe centered on the property with a marker.
export function MapPreview({ lat, lon, className, zoom = 16 }: Props) {
  // Build a small bounding box around the point for the bbox embed.
  const d = 0.004; // ~400m
  const bbox = [lon - d, lat - d, lon + d, lat + d].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-md border border-card-border bg-muted ${
        className ?? "aspect-[16/10]"
      }`}
      data-testid="map-preview"
    >
      <iframe
        title="Property location map"
        src={src}
        className="absolute inset-0 w-full h-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
