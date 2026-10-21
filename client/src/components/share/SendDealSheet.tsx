// v1.8.0 Deal Sharing — "Send deal" bottom sheet (mockup screen 1).
// Email required, mobile optional (opens Messages via sms: — never stored),
// note ≤ 280. On success: toast, refresh Sent, and hand off to SMS if a
// number was entered.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateShares, shareErrorMessage, truncateEmail } from "@/lib/shares";
import { openSmsWithFallback } from "@/lib/sms";
import {
  SHARE_ERRORS,
  SHARE_NOTE_MAX,
  formatUsPhone,
  isValidShareEmail,
  normalizeShareEmail,
  normalizeUsPhone,
  type CreateShareResponse,
} from "@shared/dealShares";

const INCLUDED = ["Deal inputs", "ARV + comps", "Sources & Uses", "Walkthrough Budget", "Comp Hero"];

function FieldLabel({ label, hint, hintClass }: { label: string; hint: string; hintClass?: string }) {
  return (
    <div className="mt-3.5 mb-1.5 flex justify-between text-[12px] font-semibold text-muted-foreground">
      <span>{label}</span>
      <span className={hintClass ?? "font-medium text-muted-foreground/60"}>{hint}</span>
    </div>
  );
}

const fieldClass =
  "h-12 rounded-xl border-border bg-background px-3.5 text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#5fd4e7] focus-visible:shadow-[0_0_0_3px_rgba(95,212,231,0.12)]";

export function SendDealSheet({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setPhone("");
      setNote("");
      setError(null);
    }
  }, [open]);

  const send = useMutation({
    mutationFn: async (): Promise<CreateShareResponse> => {
      const res = await apiRequest("POST", `/api/deals/${dealId}/share`, {
        email: normalizeShareEmail(email),
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (r) => {
      const to = truncateEmail(normalizeShareEmail(email));
      invalidateShares();
      onOpenChange(false);
      if (r.inviteEmailFailed) {
        toast({ title: "Deal saved, but the invite email failed — share the link by text instead." });
      } else {
        toast({ title: r.displayStatus === "INVITED" ? `Invite emailed to ${to}` : `Sent to ${to}` });
      }
      if (r.smsTo && r.smsBody) {
        openSmsWithFallback(r.smsTo, r.smsBody, (copied) => {
          if (copied) toast({ title: "Text copied — paste into Messages." });
        });
      }
    },
    onError: (e) => setError(shareErrorMessage(e)),
  });

  const noteLen = note.length;
  const noteOver = noteLen > SHARE_NOTE_MAX;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidShareEmail(normalizeShareEmail(email))) return setError(SHARE_ERRORS.invalidEmail);
    if (phone.trim() && !normalizeUsPhone(phone)) return setError(SHARE_ERRORS.phone);
    if (noteOver) return setError(SHARE_ERRORS.note);
    send.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] border-t border-border bg-card px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] [&>button]:right-5 [&>button]:top-[34px]"
        data-testid="sheet-send-deal"
      >
        <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-muted-foreground/30" aria-hidden />
        <SheetHeader className="space-y-0.5 text-left">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.01em]">Send deal</SheetTitle>
          <SheetDescription className="text-[12px]">
            They'll get their own copy to edit. Your deal stays unchanged.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={submit} noValidate>
          <FieldLabel label="Email" hint="required" />
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            data-testid="input-share-email"
          />

          <FieldLabel label="Mobile number" hint="optional" />
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(410) 555-0182"
            value={phone}
            onChange={(e) => setPhone(formatUsPhone(e.target.value))}
            className={fieldClass}
            data-testid="input-share-phone"
          />
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground/80">
            Adding a number opens your Messages app with a pre-written text and link.
          </p>

          <FieldLabel
            label="Note"
            hint={`${noteLen} / ${SHARE_NOTE_MAX}`}
            hintClass={noteOver ? "font-semibold text-[#e56666]" : undefined}
          />
          <Textarea
            rows={2}
            placeholder="Add a note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${fieldClass} h-auto min-h-[62px] resize-none py-3 leading-snug`}
            data-testid="input-share-note"
          />

          <div className="mt-3.5 text-[12px] font-semibold text-muted-foreground">Included</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INCLUDED.map((x) => (
              <span
                key={x}
                className="rounded-lg border border-border bg-background px-2 py-[5px] text-[11.5px] text-foreground/80"
              >
                <span className="font-bold text-[#7fd4a8]">✓ </span>
                {x}
              </span>
            ))}
          </div>

          {error && (
            <p className="mt-3 text-[12.5px] font-medium text-[#e56666]" role="alert" data-testid="text-share-error">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={send.isPending || noteOver}
            className="mt-[18px] h-[50px] w-full rounded-xl bg-[#5fd4e7] text-[15px] font-bold text-[#0a0e12] hover:bg-[#7be3f0]"
            data-testid="button-send-deal-submit"
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send deal"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
