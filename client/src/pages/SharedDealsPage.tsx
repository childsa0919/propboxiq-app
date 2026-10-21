// v1.8.0 Deal Sharing — "Shared deals" page: Inbox (received, pending) and
// Sent (status per share). Mockup screens 3 + 4.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Inbox as InboxIcon, Send } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  HIGHLIGHT_SHARE_KEY,
  SHARES_INBOX_KEY,
  SHARES_SENT_KEY,
  invalidateShares,
  shareErrorMessage,
} from "@/lib/shares";
import { SharedDealCard } from "@/components/share/SharedDealCard";
import { SentShareRow } from "@/components/share/SentShareRow";
import { displayNameOf, type InboxShare, type SentShare } from "@shared/dealShares";

type Tab = "inbox" | "sent";

function takeHighlight(): number | null {
  try {
    const v = sessionStorage.getItem(HIGHLIGHT_SHARE_KEY);
    if (v) sessionStorage.removeItem(HIGHLIGHT_SHARE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="text-[15px] font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-[280px] text-[13px] text-muted-foreground">{body}</p>
    </div>
  );
}

export default function SharedDealsPage({ initialTab = "inbox" }: { initialTab?: Tab }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [highlightId] = useState<number | null>(() => takeHighlight());
  const [confirmDecline, setConfirmDecline] = useState<InboxShare | null>(null);
  const [busy, setBusy] = useState<{ id: number; kind: "accept" | "decline" } | null>(null);

  const inbox = useQuery<InboxShare[]>({ queryKey: SHARES_INBOX_KEY, refetchOnWindowFocus: true });
  const sent = useQuery<SentShare[]>({ queryKey: SHARES_SENT_KEY, refetchOnWindowFocus: true });
  const inboxItems = inbox.data ?? [];
  const sentItems = sent.data ?? [];

  useEffect(() => {
    if (highlightId == null || !inbox.data) return;
    document.getElementById(`share-${highlightId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, inbox.data]);

  const accept = useMutation({
    mutationFn: async (s: InboxShare) => (await apiRequest("POST", `/api/shares/${s.id}/accept`)).json() as Promise<{ dealId: number }>,
    onMutate: (s) => setBusy({ id: s.id, kind: "accept" }),
    onSuccess: ({ dealId }) => {
      invalidateShares();
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal added to your list." });
      navigate(`/deal/${dealId}`);
    },
    onError: (e) => {
      invalidateShares();
      toast({ title: shareErrorMessage(e), variant: "destructive" });
    },
    onSettled: () => setBusy(null),
  });

  const decline = useMutation({
    mutationFn: async (s: InboxShare) => (await apiRequest("POST", `/api/shares/${s.id}/decline`)).json(),
    onMutate: (s) => setBusy({ id: s.id, kind: "decline" }),
    onSuccess: () => {
      invalidateShares();
      toast({ title: "Deal declined" });
    },
    onError: (e) => {
      invalidateShares();
      toast({ title: shareErrorMessage(e), variant: "destructive" });
    },
    onSettled: () => setBusy(null),
  });

  const latestAccepted = useMemo(() => sentItems.find((s) => s.displayStatus === "ACCEPTED"), [sentItems]);
  const myName = user ? displayNameOf(user.name, user.email) : "you";

  const tabLabel = (t: Tab) => {
    const n = t === "inbox" ? inboxItems.length : sentItems.length;
    const base = t === "inbox" ? "Inbox" : "Sent";
    return n > 0 ? `${base} · ${n}` : base;
  };

  return (
    <div className="mx-auto max-w-md pb-[calc(2rem+env(safe-area-inset-bottom,0px))]" data-testid="page-shared-deals">
      <div className="px-5 pb-3.5 pt-1">
        <h1 className="text-[24px] font-bold tracking-[-0.02em]">Shared deals</h1>
      </div>

      <div className="mx-5 mb-4 flex rounded-xl border border-border bg-card p-1" role="tablist">
        {(["inbox", "sent"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-[9px] py-[9px] text-[14px] font-semibold transition-colors ${
              tab === t ? "bg-[#126D85] text-white" : "text-muted-foreground"
            }`}
            data-testid={`tab-${t}`}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {tab === "inbox" ? (
        <div className="space-y-3 px-5">
          {inbox.isLoading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
          ) : inboxItems.length === 0 ? (
            <Empty
              icon={<InboxIcon className="h-5 w-5" />}
              title="No shared deals yet"
              body="When someone sends you a deal, it shows up here for you to accept or decline."
            />
          ) : (
            inboxItems.map((s) => (
              <SharedDealCard
                key={s.id}
                share={s}
                highlighted={s.id === highlightId}
                busy={busy?.id === s.id ? busy.kind : null}
                onAccept={() => accept.mutate(s)}
                onDecline={() => setConfirmDecline(s)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="px-5">
          {sent.isLoading ? (
            <div className="h-48 animate-pulse rounded-2xl bg-muted/50" />
          ) : sentItems.length === 0 ? (
            <Empty
              icon={<Send className="h-5 w-5" />}
              title="Nothing sent yet"
              body="Open a Flip deal and tap Send deal to share your analysis."
            />
          ) : (
            <>
              <div>
                {sentItems.map((s, i) => (
                  <SentShareRow key={s.id} share={s} last={i === sentItems.length - 1} />
                ))}
              </div>
              {latestAccepted && (
                <div className="mt-3.5 rounded-2xl border border-card-border bg-card px-4 py-[15px]" data-testid="card-accepted-copy">
                  <div className="text-[12px] font-bold tracking-[0.1em] text-[#5fd4e7]">ACCEPTED COPY</div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {latestAccepted.recipientEmail} now owns their own version of {latestAccepted.summary.street}. Edits
                    on either side stay separate. Their copy starts with a "Received from {myName}" snapshot.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Sheet open={!!confirmDecline} onOpenChange={(o) => !o && setConfirmDecline(null)}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-md rounded-t-[26px] border-t border-border bg-card px-5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] [&>button]:hidden"
          data-testid="sheet-decline-confirm"
        >
          <div className="mx-auto mb-4 h-[5px] w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-[19px] font-bold tracking-[-0.01em]">Decline this deal?</SheetTitle>
            <SheetDescription className="text-[13px]">The sender will see it was declined.</SheetDescription>
          </SheetHeader>
          <div className="mt-5 flex gap-[9px]">
            <Button
              variant="outline"
              onClick={() => setConfirmDecline(null)}
              className="h-[50px] flex-1 rounded-xl bg-transparent text-[15px] font-bold"
              data-testid="button-decline-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmDecline) decline.mutate(confirmDecline);
                setConfirmDecline(null);
              }}
              className="h-[50px] flex-1 rounded-xl bg-[#e56666] text-[15px] font-bold text-white hover:bg-[#e56666]/90"
              data-testid="button-decline-confirm"
            >
              Decline
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
