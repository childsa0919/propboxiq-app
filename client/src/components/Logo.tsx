import { useTheme } from "./ThemeProvider";

interface Props {
  className?: string;
  size?: number;
  /**
   * "auto" (default): full plaid-cutout mark for sizes ≥ 24px,
   * simplified silhouette for tiny sizes ≤ 22px.
   * "full" forces the standard 4-cell plaid+house-cutout mark.
   * "simplified" forces the favicon-friendly solid-house-in-BL variant.
   */
  variant?: "auto" | "full" | "simplified";
  /** Override default ink color. Falls back to brand ink (light) or near-black (dark). */
  ink?: string;
  /**
   * Override the BR (teal) tile fill. By default the BR tile is theme-aware:
   * light → #126D85 (brand teal), dark → #7be3f0 (cyan-bright).
   */
  teal?: string;
}

/**
 * PropBoxIQ logo — locked plaid+house-cutout mark.
 *
 * Composition (80×80 viewBox):
 *  • Top-left:     black cell with house-shaped knockout (variant="full")
 *                  OR plain black cell with white house silhouette (variant="simplified")
 *  • Top-right:    plain black cell
 *  • Bottom-left:  plain black cell (full) or black cell with house silhouette (simplified)
 *  • Bottom-right: brand accent — teal #126D85 on light, cyan-bright #7be3f0 on dark.
 *
 * Geometry is locked (Direction A spec). The only theme delta is the BR fill, which
 * shifts to cyan-bright on dark to match the propboxiq.com Coastal Teal palette.
 */
export function Logo({
  className,
  size = 28,
  variant = "auto",
  ink,
  teal,
}: Props) {
  const { theme } = useTheme();
  const useSimplified =
    variant === "simplified" || (variant === "auto" && size <= 22);

  const inkColor = ink ?? "#0a0e12";
  const tealColor =
    teal ?? (theme === "dark" ? "#7be3f0" : "#126D85");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      role="img"
      aria-label="PropBoxIQ"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {useSimplified ? (
        <>
          {/* Top-left: plain black */}
          <rect x="6" y="6" width="32" height="32" rx="4" fill={inkColor} />
          {/* Top-right: plain black */}
          <rect x="42" y="6" width="32" height="32" rx="4" fill={inkColor} />
          {/* Bottom-left: black cell + solid white house silhouette */}
          <rect x="6" y="42" width="32" height="32" rx="4" fill={inkColor} />
          <path d="M22 50 L32 58 L32 68 L12 68 L12 58 Z" fill="#ffffff" />
          {/* Bottom-right: brand accent */}
          <rect x="42" y="42" width="32" height="32" rx="4" fill={tealColor} />
        </>
      ) : (
        <>
          {/* Top-left: black cell with house-shaped knockout */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10 6 L34 6 Q38 6 38 10 L38 34 Q38 38 34 38 L10 38 Q6 38 6 34 L6 10 Q6 6 10 6 Z M21.30 15.10 Q22.00 14.60 22.70 15.10 L30.00 20.90 L30.00 32.60 Q30.00 38.00 31.50 38.00 L12.50 38.00 Q14.00 38.00 14.00 32.60 L14.00 20.90 L21.30 15.10 Z"
            fill={inkColor}
          />
          {/* Top-right: plain black */}
          <rect x="42" y="6" width="32" height="32" rx="4" fill={inkColor} />
          {/* Bottom-left: plain black */}
          <rect x="6" y="42" width="32" height="32" rx="4" fill={inkColor} />
          {/* Bottom-right: brand accent */}
          <rect x="42" y="42" width="32" height="32" rx="4" fill={tealColor} />
        </>
      )}
    </svg>
  );
}

/**
 * Two-tone wordmark "PropBox" + "IQ" with the locked teal accent.
 * On dark theme, "PropBox" inverts to white and "IQ" flips to cyan-bright.
 */
export function Wordmark({
  className,
  size = 16,
}: {
  className?: string;
  size?: number;
}) {
  const { theme } = useTheme();
  const propboxColor = theme === "dark" ? "#ffffff" : "#0a0e12";
  const iqColor = theme === "dark" ? "#7be3f0" : "#126D85";

  return (
    <span
      className={className}
      style={{
        fontFamily: "'General Sans', 'Inter', sans-serif",
        fontWeight: 700,
        fontSize: size,
        letterSpacing: "-0.025em",
        color: propboxColor,
        lineHeight: 1,
      }}
    >
      PropBox<span style={{ color: iqColor }}>IQ</span>
    </span>
  );
}
