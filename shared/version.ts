// Single source of truth for the app version. Kept in sync with the `version`
// field in package.json. Imported by the client (Settings + footer) and anywhere
// else that needs to display or compare the running app version.
export const APP_VERSION = "1.7.2";

// Numeric semver compare. Returns <0 if a<b, 0 if equal, >0 if a>b. Tolerates
// missing/partial versions (treats missing segments as 0) and ignores any
// pre-release/build suffix after the first three numeric segments.
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? "")
      .split(".")
      .slice(0, 3)
      .map((p) => parseInt(p, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
