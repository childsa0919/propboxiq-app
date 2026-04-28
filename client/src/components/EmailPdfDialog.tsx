import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Mail, Check, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";

type SendState = "idle" | "sending" | "sent" | "error";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once on send to build the PDF on demand. */
  getPdf: () => Promise<{ base64: string; filename: string } | null>;
  /** Pre-filled subject (e.g. "Deal memo: 123 Main St"). */
  defaultSubject: string;
  /** Pre-filled body (e.g. address + ARV summary). */
  defaultMessage: string;
}

const isLikelyEmail = (s: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export function EmailPdfDialog({
  open,
  onOpenChange,
  getPdf,
  defaultSubject,
  defaultMessage,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [ccSelf, setCcSelf] = useState(true);
  const [state, setState] = useState<SendState>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Reset prefill values when dialog opens fresh
  useEffect(() => {
    if (open) {
      setSubject(defaultSubject);
      setMessage(defaultMessage);
      setState("idle");
      setErrMsg(null);
    }
  }, [open, defaultSubject, defaultMessage]);

  const validEmail = isLikelyEmail(to);
  const canSend = validEmail && subject.trim().length > 0 && state !== "sending";

  async function handleSend() {
    if (!canSend) return;
    setState("sending");
    setErrMsg(null);
    try {
      const built = await getPdf();
      if (!built) {
        throw new Error("Failed to build PDF");
      }
      let resp: Response;
      try {
        resp = await apiRequest("POST", "/api/email/deal-pdf", {
          to: to.trim(),
          ccSelf,
          subject: subject.trim(),
          message,
          pdfBase64: built.base64,
          filename: built.filename,
        });
      } catch (err: any) {
        // apiRequest throws on non-2xx with format "<status>: <body>"
        const raw = String(err?.message ?? "");
        // Try to extract { error } JSON from the body part
        const colonIdx = raw.indexOf(":");
        const body = colonIdx >= 0 ? raw.slice(colonIdx + 1).trim() : raw;
        try {
          const parsed = JSON.parse(body);
          throw new Error(parsed?.error ?? "Send failed");
        } catch (parseErr: any) {
          if (parseErr instanceof SyntaxError) {
            throw new Error(body || "Send failed");
          }
          throw parseErr;
        }
      }
      const data = (await resp.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Send failed");
      setState("sent");
      toast({ title: "Email sent", description: `Memo sent to ${to.trim()}` });
      // Close after a short success beat
      setTimeout(() => onOpenChange(false), 900);
    } catch (e: any) {
      setState("error");
      setErrMsg(e?.message ?? "Send failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Mail className="h-5 w-5" />
            Email deal memo
          </DialogTitle>
          <DialogDescription>
            Send the PDF directly to your buyer, lender, or partner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              type="email"
              placeholder="buyer@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              data-testid="input-email-to"
              autoComplete="email"
              disabled={state === "sending"}
            />
            {to.length > 0 && !validEmail && (
              <p className="text-xs text-destructive">Enter a valid email address.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-email-subject"
              disabled={state === "sending"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-message">Message</Label>
            <Textarea
              id="email-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="input-email-message"
              disabled={state === "sending"}
            />
          </div>

          {user?.email && (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
              <div className="space-y-0.5">
                <Label htmlFor="cc-self" className="text-sm">
                  CC me
                </Label>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Switch
                id="cc-self"
                checked={ccSelf}
                onCheckedChange={setCcSelf}
                data-testid="switch-cc-self"
                disabled={state === "sending"}
              />
            </div>
          )}

          {state === "error" && errMsg && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="text-email-error"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{errMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={state === "sending"}
            data-testid="button-email-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend || state === "sent"}
            data-testid="button-email-send"
          >
            {state === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending…
              </>
            ) : state === "sent" ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Sent
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
