// Central Chart.js registration for the Hold result charts. Registers only the
// controllers/elements/scales we actually use so tree-shaking keeps the bundle
// lean. Import this module once (side-effect) before rendering any chart.

import {
  Chart as ChartJS,
  LineController,
  DoughnutController,
  LineElement,
  PointElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";

let registered = false;

export function ensureChartsRegistered(): void {
  if (registered) return;
  ChartJS.register(
    LineController,
    DoughnutController,
    LineElement,
    PointElement,
    ArcElement,
    LinearScale,
    CategoryScale,
    Filler,
    Tooltip,
  );
  ChartJS.defaults.color = "#c8d4dc";
  ChartJS.defaults.font.family = "'Inter', sans-serif";
  ChartJS.defaults.font.size = 11;
  registered = true;
}

// Coastal Teal palette pulled from the locked CSS tokens. Kept here so the
// chart datasets reference named colors instead of scattering hex literals.
export const CHART_COLORS = {
  teal: "#126D85",
  cyan: "#5fd4e7",
  cyanBright: "#7be3f0",
  gold: "#f5c948",
  good: "#4ade80",
  bad: "#f87171",
  warn: "#fb923c",
  violet: "#a78bfa",
  grid: "rgba(255,255,255,0.10)",
  tick: "#c8d4dc",
} as const;
