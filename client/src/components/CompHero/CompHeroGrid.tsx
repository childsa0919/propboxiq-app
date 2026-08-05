// 2×2 (responsive) comp grid.

import { CompHeroCard } from "./CompHeroCard";
import type { CompHeroCardData, SaleCompsSubject } from "./types";

export function CompHeroGrid({
  comps,
  selectedKeys,
  subject,
  onToggle,
  onDeleteManual,
}: {
  comps: CompHeroCardData[];
  selectedKeys: Set<string>;
  subject: SaleCompsSubject;
  onToggle: (key: string) => void;
  onDeleteManual: (manualId: string) => void;
}) {
  if (comps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
        No comps yet. Add one below or refresh the deal to pull auto comps.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="comp-hero-grid">
      {comps.map((c) => (
        <CompHeroCard
          key={c.key}
          comp={c}
          selected={selectedKeys.has(c.key)}
          subject={subject}
          onToggle={() => onToggle(c.key)}
          onDelete={c.manualId ? () => onDeleteManual(c.manualId!) : undefined}
        />
      ))}
    </div>
  );
}
