import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { Deal } from "@shared/schema";
import {
  BUDGET_CATEGORIES,
  categorySubtotal,
  budgetGrandTotal,
  type DealBudget,
  type BudgetLineItem,
} from "@shared/budgetTemplate";
import { useDealBudget } from "@/lib/useDealBudget";
import { exportBudgetPdf } from "@/lib/budgetPdf";
import { fmtUSD } from "@/lib/calc";
import { ChevronRight, Plus, Trash2, FileDown } from "lucide-react";

const GOLD = "#f5c948";
const INK = "#0a0e12";
const CYAN = "#5fd4e7";
const CARD_BG = "#141b22";
const MUTED = "#4a5560";

const SAVE_DEBOUNCE_MS = 500;

interface Props {
  deal: Deal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the grand total when the user taps "Apply to Deal". */
  onApply: (total: number) => void;
}

export function WalkthroughBudget({ deal, open, onOpenChange, onApply }: Props) {
  const dealId = deal.id;
  const { budget, save } = useDealBudget(dealId);

  const [local, setLocal] = useState<DealBudget | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<DealBudget | null>(null);

  // Hydrate local state from the loaded budget when the sheet opens.
  useEffect(() => {
    if (open && local === null && budget) {
      setLocal(budget);
    }
  }, [open, local, budget]);

  // Flush any pending save immediately, cancelling the debounce timer.
  function flush() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pending.current) {
      save(pending.current);
      pending.current = null;
    }
  }

  // Reset local state + flush when the sheet closes so the next open re-hydrates.
  useEffect(() => {
    if (!open && local !== null) {
      flush();
      setLocal(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup on unmount.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function commit(next: DealBudget) {
    setLocal(next);
    pending.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (pending.current) {
        save(pending.current);
        pending.current = null;
      }
      saveTimer.current = null;
    }, SAVE_DEBOUNCE_MS);
  }

  function toggleCat(catId: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function updateItems(
    catId: string,
    fn: (items: BudgetLineItem[]) => BudgetLineItem[],
  ) {
    if (!local) return;
    const cur = local.categories[catId]?.items ?? [];
    commit({
      ...local,
      categories: {
        ...local.categories,
        [catId]: { items: fn(cur) },
      },
    });
  }

  function setAmount(catId: string, itemId: string, amount: number) {
    updateItems(catId, (items) =>
      items.map((it) => (it.id === itemId ? { ...it, amount } : it)),
    );
  }

  function setLabel(catId: string, itemId: string, label: string) {
    updateItems(catId, (items) =>
      items.map((it) => (it.id === itemId ? { ...it, label } : it)),
    );
  }

  function addItem(catId: string) {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    updateItems(catId, (items) => [
      ...items,
      { id, label: "", amount: 0, isCustom: true },
    ]);
  }

  function deleteItem(catId: string, itemId: string) {
    updateItems(catId, (items) => items.filter((it) => it.id !== itemId));
  }

  const view = local ?? budget;
  const grand = budgetGrandTotal(view);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="p-0 gap-0 h-[100dvh] w-full sm:max-w-none flex flex-col border-0"
        style={{ backgroundColor: INK }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-4 border-b shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="min-w-0">
            <SheetTitle className="text-white text-base font-semibold">
              Walkthrough Budget
            </SheetTitle>
            <SheetDescription className="text-[11px] truncate" style={{ color: MUTED }}>
              {deal.name?.trim() || deal.address}
            </SheetDescription>
          </div>
          {/* The SheetContent close button (X) sits top-right automatically. */}
        </div>

        {/* Body — scrollable category cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {BUDGET_CATEGORIES.map((cat) => {
            const items = view.categories[cat.id]?.items ?? [];
            const subtotal = categorySubtotal(view, cat.id);
            const isOpen = openCats.has(cat.id);
            return (
              <div
                key={cat.id}
                className="rounded-lg overflow-hidden"
                style={{
                  backgroundColor: CARD_BG,
                  borderLeft: `3px solid ${cat.color}`,
                }}
              >
                {/* Category header row */}
                <button
                  type="button"
                  onClick={() => toggleCat(cat.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                  data-testid={`budget-cat-${cat.id}`}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      className="h-4 w-4 transition-transform"
                      style={{
                        color: MUTED,
                        transform: isOpen ? "rotate(90deg)" : "none",
                      }}
                    />
                    <span
                      className="uppercase font-semibold tracking-wide"
                      style={{ fontSize: 11, color: "#c7d0d9" }}
                    >
                      {cat.name}
                    </span>
                  </div>
                  <span
                    className="text-sm font-bold tabular-nums"
                    style={{ color: subtotal > 0 ? "#fff" : MUTED }}
                  >
                    {fmtUSD(subtotal)}
                  </span>
                </button>

                {/* Category body */}
                {isOpen && (
                  <div className="px-4 pb-3">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-center gap-2 py-1.5">
                        {it.isCustom ? (
                          <input
                            type="text"
                            value={it.label}
                            placeholder="Custom item"
                            onChange={(e) => setLabel(cat.id, it.id, e.target.value)}
                            className="flex-1 min-w-0 bg-transparent text-sm outline-none border-b"
                            style={{ color: "#e5e9ed", borderColor: "rgba(255,255,255,0.12)" }}
                            data-testid={`budget-label-${it.id}`}
                          />
                        ) : (
                          <span className="flex-1 min-w-0 text-sm" style={{ color: "#e5e9ed" }}>
                            {it.label}
                          </span>
                        )}
                        <AmountInput
                          value={it.amount}
                          onChange={(n) => setAmount(cat.id, it.id, n)}
                          testId={`budget-amount-${it.id}`}
                        />
                        {it.isCustom && (
                          <button
                            type="button"
                            onClick={() => deleteItem(cat.id, it.id)}
                            aria-label="Delete line item"
                            className="shrink-0 p-1"
                            data-testid={`budget-delete-${it.id}`}
                          >
                            <Trash2 className="h-4 w-4" style={{ color: MUTED }} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addItem(cat.id)}
                      className="flex items-center gap-1.5 mt-2 text-xs font-medium"
                      style={{ color: CYAN }}
                      data-testid={`budget-add-${cat.id}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add line item
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="h-2" />
        </div>

        {/* Sticky footer */}
        <div
          className="shrink-0 px-4 pt-3 pb-5 border-t"
          style={{
            backgroundColor: INK,
            borderColor: "rgba(255,255,255,0.08)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
          }}
        >
          {/* Proportional stacked bar */}
          <div
            className="flex w-full h-1.5 rounded-full overflow-hidden mb-3"
            style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            {grand > 0 &&
              BUDGET_CATEGORIES.map((cat) => {
                const sub = categorySubtotal(view, cat.id);
                if (sub <= 0) return null;
                return (
                  <div
                    key={cat.id}
                    style={{
                      width: `${(sub / grand) * 100}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                );
              })}
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="uppercase tracking-wide" style={{ fontSize: 11, color: MUTED }}>
              Total Rehab
            </span>
            <span
              className="tabular-nums text-white"
              style={{ fontSize: 22, fontWeight: 800 }}
              data-testid="budget-grand-total"
            >
              {fmtUSD(grand)}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => exportBudgetPdf(deal, view)}
              className="flex-1 bg-transparent"
              style={{ borderColor: CYAN, color: CYAN }}
              data-testid="budget-export-pdf"
            >
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button
              type="button"
              onClick={() => {
                flush();
                onApply(grand);
                onOpenChange(false);
              }}
              className="flex-[2] font-semibold hover:opacity-90"
              style={{ backgroundColor: GOLD, color: INK }}
              data-testid="budget-apply"
            >
              Apply to Deal
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Numeric input that shows a raw number while focused and currency on blur.
function AmountInput({
  value,
  onChange,
  testId,
}: {
  value: number;
  onChange: (n: number) => void;
  testId?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");

  const display = focused ? text : value > 0 ? fmtUSD(value) : "";

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder="$0"
      onFocus={() => {
        setText(value > 0 ? String(value) : "");
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        setText(raw);
        const n = parseFloat(raw);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className="w-[100px] shrink-0 text-right text-sm tabular-nums rounded-md px-2 py-1.5 outline-none"
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        color: "#fff",
      }}
      data-testid={testId}
    />
  );
}
