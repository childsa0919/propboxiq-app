// Walkthrough Budget — default template shared by client and server.
//
// The user itemizes a rehab budget across 7 fixed categories. Each category
// ships with a set of default line items (all starting at $0). Users can add
// custom line items to any category and delete only the ones they added; the
// default items can be zeroed out but not removed.
//
// Persisted per-deal as JSON in deals.budget with the DealBudget shape below.

export interface BudgetLineItem {
  id: string;
  label: string;
  amount: number;
  isCustom: boolean;
}

export interface BudgetCategory {
  id: string;
  name: string;
  color: string; // left-border accent, from the approved palette
}

export interface DealBudget {
  categories: {
    [categoryId: string]: { items: BudgetLineItem[] };
  };
}

// Ordered category definitions (drives render order and PDF section order).
export const BUDGET_CATEGORIES: BudgetCategory[] = [
  { id: "prep", name: "Prep", color: "#7a8896" },
  { id: "internal", name: "Internal Structure", color: "#126D85" },
  { id: "trades", name: "Trades", color: "#5fd4e7" },
  { id: "interior", name: "Interior Finish", color: "#b8a3d9" },
  { id: "kitchen", name: "Kitchen", color: "#e8a24a" },
  { id: "bathrooms", name: "Bathrooms", color: "#7fd4a8" },
  { id: "exterior", name: "Exterior", color: "#f5c948" },
];

// Default line-item labels per category (approved mapping).
const DEFAULT_ITEMS: Record<string, string[]> = {
  prep: ["Demo", "Dumpsters", "Water Proofing"],
  internal: ["Foundation", "Framing", "Insulation", "Drywall"],
  trades: ["Plumbing", "HVAC", "Electrical"],
  interior: ["Trim/Moldings", "Paint", "Recessed Lights", "Light Fixtures"],
  kitchen: [
    "Kitchen Cabinets",
    "Kitchen Countertops",
    "Kitchen Appliances",
    "Laundry Appliances",
  ],
  bathrooms: [
    "Bathroom Vanities",
    "Bathroom Fixtures",
    "Bathroom Glass",
    "Bathroom Tile",
  ],
  exterior: [
    "Doors Exterior",
    "Windows",
    "Siding",
    "Roof",
    "Garage Doors",
    "Landscaping",
    "Deck",
  ],
};

// Stable id for a default item so the same item merges cleanly across reloads.
function defaultItemId(categoryId: string, label: string): string {
  return `${categoryId}-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

/** Fresh default budget — every default item present with amount 0. */
export function createDefaultBudget(): DealBudget {
  const categories: DealBudget["categories"] = {};
  for (const cat of BUDGET_CATEGORIES) {
    categories[cat.id] = {
      items: (DEFAULT_ITEMS[cat.id] ?? []).map((label) => ({
        id: defaultItemId(cat.id, label),
        label,
        amount: 0,
        isCustom: false,
      })),
    };
  }
  return { categories };
}

/**
 * Normalize an arbitrary stored value into a valid DealBudget: guarantees every
 * category exists and that default items are present (so template changes across
 * versions surface new defaults without dropping the user's saved amounts).
 */
export function normalizeBudget(raw: unknown): DealBudget {
  const base = createDefaultBudget();
  if (!raw || typeof raw !== "object") return base;
  const rawCats = (raw as any).categories;
  if (!rawCats || typeof rawCats !== "object") return base;

  for (const cat of BUDGET_CATEGORIES) {
    const savedItems: BudgetLineItem[] = Array.isArray(rawCats[cat.id]?.items)
      ? rawCats[cat.id].items
      : [];
    const savedById = new Map<string, BudgetLineItem>();
    const customItems: BudgetLineItem[] = [];
    for (const it of savedItems) {
      if (!it || typeof it.id !== "string") continue;
      const item: BudgetLineItem = {
        id: it.id,
        label: String(it.label ?? ""),
        amount: Number.isFinite(it.amount) ? Number(it.amount) : 0,
        isCustom: !!it.isCustom,
      };
      if (item.isCustom) customItems.push(item);
      else savedById.set(item.id, item);
    }
    // Merge saved amounts onto the current default set, then append customs.
    const merged = base.categories[cat.id].items.map((def) => {
      const saved = savedById.get(def.id);
      return saved ? { ...def, amount: saved.amount, label: saved.label || def.label } : def;
    });
    base.categories[cat.id] = { items: [...merged, ...customItems] };
  }
  return base;
}

/** Sum a single category's line items. */
export function categorySubtotal(budget: DealBudget, categoryId: string): number {
  const items = budget.categories[categoryId]?.items ?? [];
  return items.reduce((sum, it) => sum + (Number.isFinite(it.amount) ? it.amount : 0), 0);
}

/** Grand total across all categories. */
export function budgetGrandTotal(budget: DealBudget): number {
  return BUDGET_CATEGORIES.reduce(
    (sum, cat) => sum + categorySubtotal(budget, cat.id),
    0,
  );
}
