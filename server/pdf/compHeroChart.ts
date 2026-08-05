// Inline SVG "$/SQFT COMPARABLES" bar chart for the institutional Comp Hero
// PDF. Hand-drawn SVG rather than Chart.js-on-canvas: sharp at any
// zoom/print DPI, no font-metric/canvas-timing race with Puppeteer, and no
// extra runtime dependency. Muted-gold bars, dashed subject $/sqft line,
// small data labels above each bar, subject legend at top-right.
//
// v1.7.6 fix: v1.7.5 placed the value label directly on top of the bar
// (`y - 5`, i.e. barely clearing the bar's own top edge), which visibly
// overlapped tall bars against the plot's top padding — screenshots showed
// "$361" sitting right on the bar. We now reserve dedicated label headroom
// above the tallest possible bar (the plot area itself is scaled down to
// leave room) so every label sits clearly above its bar with breathing
// room, in Inter 8pt gray per spec (not serif) so it doesn't compete
// visually with the bars. Y-axis now always renders exactly 5 gridlines at
// clean round-number steps ($100/$200/$300/$400-style), and X-axis keeps
// the "Comp 1", "Comp 2"... labels under each bar.

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
  const padTop = 22; // headroom reserved for the above-bar value labels
  const padBottom = 22;
  const plotW = CHART_W - padLeft - padRight;
  const plotH = CHART_H - padTop - padBottom;

  const values = comps.map((c) => c.ppsf).filter((n) => Number.isFinite(n));
  const maxVal = Math.max(...values, subjectPpsf ?? 0, 1);
  // Round the axis max up to a clean step so the 5 gridlines land on tidy
  // numbers ($100 / $200 / $300 / $400-style rather than odd increments).
  const rawStep = maxVal / 4;
  const step = Math.ceil(rawStep / 25) * 25 || 25;
  const axisMax = step * 4;

  const n = Math.max(comps.length, 1);
  const gap = 10;
  const barW = (plotW - gap * (n - 1)) / n;

  const yFor = (val: number) => padTop + plotH - (val / axisMax) * plotH;

  // Exactly 5 Y-axis tick lines: 0, step, 2*step, 3*step, 4*step (axisMax).
  const gridLines = [0, 1, 2, 3, 4]
    .map((i) => {
      const val = step * i;
      const y = yFor(val);
      return `
      <line x1="${padLeft}" y1="${y}" x2="${CHART_W - padRight}" y2="${y}" stroke="#e6dfc9" stroke-width="0.75" />
      <text x="${padLeft - 6}" y="${y + 3}" font-family="Inter, sans-serif" font-size="7" fill="${GRAY}" text-anchor="end">$${val}</text>
    `;
    })
    .join("");

  const bars = comps
    .map((c, i) => {
      const x = padLeft + i * (barW + gap);
      const y = yFor(c.ppsf);
      const h = padTop + plotH - y;
      const labelX = x + barW / 2;
      // Label sits a fixed 10px above the bar top, clamped so it never
      // renders above the chart's own top edge even for the tallest bar.
      const labelY = Math.max(y - 8, 10);
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${GOLD}" rx="1.5" />
        <text x="${labelX}" y="${labelY}" font-family="Inter, sans-serif" font-size="8" font-weight="600" fill="${GRAY}" text-anchor="middle">$${c.ppsf}</text>
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
