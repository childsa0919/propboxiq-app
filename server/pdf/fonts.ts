// Self-hosted institutional PDF fonts (v1.7.5). Playfair Display (serif,
// display/hero type) + Inter (sans, body/labels) are embedded as base64
// data-URIs so the PDF renders identically regardless of network access at
// render time — Puppeteer loads the HTML from a data: URL / local string, not
// over HTTP, so relying on Google Fonts' CDN at render time would be fragile
// (blocked egress, DNS hiccups, cold-start latency). The .woff2 files below
// were downloaded once from Google Fonts (Apache-2.0 / OFL, free for this
// use) and live in server/pdf/fonts/*.woff2 next to this file.
import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Directory resolution has to work under BOTH runtimes this file executes
// in, which use different module systems:
//   - dev (`npm run dev` -> tsx server/index.ts): this file's own module
//     record is real ESM, so `import.meta.url` -> fileURLToPath always
//     resolves correctly to server/pdf/, regardless of whether some other
//     dependency elsewhere in the graph happens to load via CJS interop
//     (tsx/esbuild-kit can flip `typeof require` process-wide depending on
//     what else got imported — e.g. importing certain CJS-only packages —
//     which makes `typeof require` an UNRELIABLE branch signal here).
//     Fonts live at server/pdf/fonts/*.woff2, right next to this file.
//   - prod (`npm run build` -> esbuild --format=cjs -> `npm start` ->
//     node dist/index.cjs): real CommonJS, `import.meta.url` is statically
//     emptied by esbuild (warns, doesn't error) so fileURLToPath throws.
//     Ambient __dirname is native there instead, resolving to dist/, and
//     script/build.ts copies the font binaries to dist/pdf/fonts.
// Rather than branching on an unreliable module-system signal, just try
// both candidate directories and use whichever actually exists on disk.
function resolveFontsDir(): string {
  const candidates: string[] = [];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(here, "fonts")); // dev layout
  } catch {
    // import.meta.url unavailable (CJS prod bundle) — fine, try __dirname below.
  }
  try {
    // eslint-disable-next-line no-undef
    candidates.push(path.join(__dirname, "pdf", "fonts")); // prod bundle layout
  } catch {
    // __dirname unavailable (pure ESM, no ambient shim) — fine, we already
    // tried import.meta.url above.
  }
  const found = candidates.find((dir) => existsSync(dir));
  if (!found) {
    throw new Error(
      `[pdf/fonts] fonts directory not found. Tried: ${candidates.join(", ") || "(no candidates resolved)"}`,
    );
  }
  return found;
}
const FONTS_DIR = resolveFontsDir();

function toDataUri(filename: string): string {
  const buf = readFileSync(path.join(FONTS_DIR, filename));
  return `data:font/woff2;base64,${buf.toString("base64")}`;
}

let cachedFontCss: string | null = null;

// Returns a <style> block with @font-face declarations for Playfair Display
// (400/500/600/700/900) and Inter (400/500/600/700), all self-hosted via
// base64 data-URIs. Cached in-process after first read.
export function getInstitutionalFontFaceCss(): string {
  if (cachedFontCss) return cachedFontCss;

  const inter400 = toDataUri("Inter-400.woff2");
  const inter500 = toDataUri("Inter-500.woff2");
  const inter600 = toDataUri("Inter-600.woff2");
  const inter700 = toDataUri("Inter-700.woff2");
  const playfair400 = toDataUri("PlayfairDisplay-400.woff2");
  const playfair500 = toDataUri("PlayfairDisplay-500.woff2");
  const playfair600 = toDataUri("PlayfairDisplay-600.woff2");
  const playfair700 = toDataUri("PlayfairDisplay-700.woff2");
  const playfair900 = toDataUri("PlayfairDisplay-900.woff2");

  cachedFontCss = `
    @font-face { font-family: 'Inter'; font-weight: 400; font-style: normal; src: url('${inter400}') format('woff2'); }
    @font-face { font-family: 'Inter'; font-weight: 500; font-style: normal; src: url('${inter500}') format('woff2'); }
    @font-face { font-family: 'Inter'; font-weight: 600; font-style: normal; src: url('${inter600}') format('woff2'); }
    @font-face { font-family: 'Inter'; font-weight: 700; font-style: normal; src: url('${inter700}') format('woff2'); }
    @font-face { font-family: 'Playfair Display'; font-weight: 400; font-style: normal; src: url('${playfair400}') format('woff2'); }
    @font-face { font-family: 'Playfair Display'; font-weight: 500; font-style: normal; src: url('${playfair500}') format('woff2'); }
    @font-face { font-family: 'Playfair Display'; font-weight: 600; font-style: normal; src: url('${playfair600}') format('woff2'); }
    @font-face { font-family: 'Playfair Display'; font-weight: 700; font-style: normal; src: url('${playfair700}') format('woff2'); }
    @font-face { font-family: 'Playfair Display'; font-weight: 900; font-style: normal; src: url('${playfair900}') format('woff2'); }
  `;
  return cachedFontCss;
}
