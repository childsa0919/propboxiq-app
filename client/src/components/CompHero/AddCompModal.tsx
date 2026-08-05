// Add Comp modal: single input + helper text "Paste address or Zillow/Redfin
// URL", loading state, calls POST /api/deals/:id/comp-hero/manual, and on
// success hands the new manual comp back to the parent (which appends it with
// a MANUAL pill).

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ManualComp } from "@shared/schema";

export function AddCompModal({
  dealId,
  open,
  onOpenChange,
  onAdded,
}: {
  dealId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (comp: ManualComp) => void;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    const input = value.trim();
    if (!input) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", `/api/deals/${dealId}/comp-hero/manual`, { input });
      const comp = (await res.json()) as ManualComp;
      onAdded(comp);
      setValue("");
      onOpenChange(false);
      toast({ title: "Comp added", description: comp.address });
    } catch (e) {
      toast({
        title: "Couldn't add that comp",
        description: "Try a different address or link.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-add-comp">
        <DialogHeader>
          <DialogTitle>Add a comp</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) submit();
            }}
            placeholder="123 Main St, Annapolis, MD or a Zillow/Redfin link"
            disabled={loading}
            data-testid="input-add-comp"
          />
          <p className="text-xs text-muted-foreground">
            Paste address or Zillow/Redfin URL
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !value.trim()} data-testid="button-submit-add-comp">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resolving…
              </>
            ) : (
              "Add comp"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
