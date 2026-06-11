// Full-width divergence banner at the top of the Hold result (Mock 3A). Maps the
// engine's divergence flavor (or the tie/versatile case) to a colored gradient +
// icon + headline + explanation. Gold for slow-burn/unicorn winners, red for
// pass, teal for the versatile tie.

interface BannerStyle {
  bg: string;
  border: string;
  iconColor: string;
  titleColor: string;
}

function styleFor(tone: "gold" | "red" | "teal"): BannerStyle {
  switch (tone) {
    case "gold":
      return {
        bg: "linear-gradient(135deg, rgba(245,201,72,0.12), rgba(245,201,72,0.04))",
        border: "rgba(245,201,72,0.4)",
        iconColor: "#f5c948",
        titleColor: "#f5c948",
      };
    case "red":
      return {
        bg: "linear-gradient(135deg, rgba(248,113,113,0.12), rgba(248,113,113,0.03))",
        border: "rgba(248,113,113,0.4)",
        iconColor: "#f87171",
        titleColor: "#f87171",
      };
    case "teal":
      return {
        bg: "linear-gradient(135deg, rgba(95,212,231,0.12), rgba(95,212,231,0.03))",
        border: "rgba(95,212,231,0.35)",
        iconColor: "#5fd4e7",
        titleColor: "#5fd4e7",
      };
  }
}

export interface DivergenceBannerProps {
  icon: string;
  title: string;
  detail: string;
  tone: "gold" | "red" | "teal";
}

export default function DivergenceBanner({ icon, title, detail, tone }: DivergenceBannerProps) {
  const s = styleFor(tone);
  return (
    <div
      className="mb-3 flex items-start gap-2.5 rounded-[14px] border p-[11px_14px]"
      style={{ background: s.bg, borderColor: s.border }}
      data-testid="banner-divergence"
    >
      <div className="mt-px flex-shrink-0 text-[18px]" style={{ color: s.iconColor }}>
        {icon}
      </div>
      <div>
        <div
          className="mb-[3px] text-[13px] font-black tracking-[-0.01em]"
          style={{ color: s.titleColor }}
          data-testid="text-divergence-title"
        >
          {title}
        </div>
        <div className="text-[11px] leading-[1.45] text-white/85">{detail}</div>
      </div>
    </div>
  );
}
