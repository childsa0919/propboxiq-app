// Inline SVG "$/SQFT COMPARABLES" bar chart for the institutional Comp Hero
// PDF (v1.7.5). Hand-drawn SVG rather than Chart.js-on-canvas: sharp at any
// zoom/print DPI, no font-metric/canvas-timing race with Puppeteer, and no
// extra runtime dependency. Muted-gold bars, dashed subject $/sqft line,
// small data labels above each bar, subject legend at top-right.

const GOLD = "#a68a3f";
const CHARCOAL = "#1a1a1a";
const GRAY = "#666666";

export interface ChartComp {
  label: string; // "Comp 1", "Comp 2", ...
  ppsf: number;
}

const CHART_W = 260;
const CHART_H = 175;

export function renderPpsfBarChartSvg(comps: ChartComp[], subjectPpsf: number | null): string {
  const padLeft = 34;
  const padRight = 8;
  const padTop = 14;
  const padBottom = 22;
  const plotW = CHART_W - padLeft - padRight;
  const plotH = CHART_H - padTop - padBottom;

  const values = comps.map((c) => c.ppsf).filter((n) => Number.isFinite(n));
  const maxVal = Math.max(...values, subjectPpsf ?? 0, 1);
  // Round the axis max up to a clean step (nearest 50 above the highest bar).
  const axisMax = Math.ceil((maxVal * 1.1) / 50) * 50;

  const n = Math.max(comps.length, 1);
  const gap = 10;
  const barW = (plotW - gap * (n - 1)) / n;

  const yFor = (val: number) => padTop + plotH - (val / axisMax) * plotH;

  // Y axis gridlines/labels at 0, 25%, 50%, 75%, 100% of axisMax.
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const val = Math.round(axisMax * frac);
    const y = yFor(val);
    return `
      <line x1="${padLeft}" y1="${y}" x2="${CHART_W - padRight}" y2="${y}" stroke="#e6dfc9" stroke-width="0.75" />
      <text x="${padLeft - 6}" y="${y + 3}" font-family="Inter, sans-serif" font-size="7" fill="${GRAY}" text-anchor="end">$${val}</text>
    `;
  }).join("");

  const bars = comps
    .map((c, i) => {
      const x = padLeft + i * (barW + gap);
      const y = yFor(c.ppsf);
      const h = padTop + plotH - y;
      const labelX = x + barW / 2;
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${GOLD}" rx="1.5" />
        <text x="${labelX}" y="${y - 5}" font-family="'Playfair Display', serif" font-size="9" font-weight="600" fill="${CHARCOAL}" text-anchor="middle">$${c.ppsf}</text>
        <text x="${labelX}" y="${CHART_H - padBottom + 12}" font-family="Inter, sans-serif" font-size="7.5" fill="${GRAY}" text-anchor="middle">${c.label}</text>
      `;
    })
    .join("");

  const subjectLine =
    subjectPpsf != null
      ? (() => {
          const y = yFor(subjectPpsf);
          return `
            <line x1="${padLeft}" y1="${y}" x2="${CHART_W - padRight}" y2="${y}" stroke="${CHARCOAL}" stroke-width="1" stroke-dasharray="4,3" />
          `;
        })()
      : "";

  const axisLine = `<line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="${GRAY}" stroke-width="0.75" />
    <line x1="${padLeft}" y1="${padTop + plotH}" x2="${CHART_W - padRight}" y2="${padTop + plotH}" stroke="${GRAY}" stroke-width="0.75" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${CHART_H}" viewBox="0 0 ${CHART_W} ${CHART_H}">
    ${gridLines}
    ${axisLine}
    ${bars}
    ${subjectLine}
  </svg>`;
}
