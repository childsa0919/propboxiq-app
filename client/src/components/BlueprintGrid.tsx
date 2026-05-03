/**
 * <BlueprintGrid />
 * Full-bleed cyan blueprint grid that fills its container. Direction A spec:
 *   - 140px cells (calmer/larger than the legacy 60px grid)
 *   - stroke = var(--grid-stroke) (teal on light, cyan on dark)
 *   - outer opacity = var(--grid-opacity) (0.10 light / 0.22 dark)
 *   - no fade gradient, no floating houses (the user picked the calmer version)
 *
 * The host container must establish a positioning context (relative).
 * The grid sits absolute, inset:0, pointer-events:none, behind sibling content.
 */
export function BlueprintGrid({
  cell = 140,
  strokeWidth = 0.8,
  className,
  zIndex = 0,
}: {
  cell?: number;
  strokeWidth?: number;
  className?: string;
  /** Optional z-index override. Defaults to 0; bring above 0 on hosts that need it. */
  zIndex?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: "var(--grid-opacity)",
        zIndex,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="bp-grid"
          width={cell}
          height={cell}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${cell} 0 L 0 0 0 ${cell}`}
            fill="none"
            stroke="var(--grid-stroke)"
            strokeWidth={strokeWidth}
            opacity="0.9"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bp-grid)" />
    </svg>
  );
}
