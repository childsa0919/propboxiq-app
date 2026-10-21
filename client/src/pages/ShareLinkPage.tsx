// v1.8.0 Deal Sharing — /s/:token landing (server redirects /s/:token → /#/s/:token).
//   mine           → open Shared deals with that card highlighted
//   other-account  → "sent to m•••@domain" + Switch account (Google)
//   unavailable    → "no longer available"
// Signed-out visitors never reach this page: the auth gate stashes the token
// and AuthGate replays it after Google sign-in.
import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MailWarning, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";
import { runningInApp } from "@/lib/native";
import { HIGHLIGHT_SHARE_KEY, rememberPendingShare } from "@/lib/shares";
import type { ShareTokenResolution } from "@shared/dealShares";

export function ShareLinkView({
  resolution,
  email,
  onSwitch,
  onHome,
}: {
  resolution: ShareTokenResolution;
  email: string;
  onSwitch: () => void;
  onHome: () => void;
}) {
  const other = resolution.state === "other-account";
  return (
    <div className="mx-auto max-w-md px-5 pt-6" data-testid={`share-link-${resolution.state}`}>
      <div className="rounded-2xl border border-card-border bg-card px-5 py-6 text-center">
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: other ? "rgba(95,212,231,0.14)" : "rgba(138,154,166,0.14)", color: other ? "#5fd4e7" : "#8a9aa6" }}
        >
          {other ? <MailWarning className="h-6 w-6" /> : <PackageX className="h-6 w-6" />}
        </div>
        {other ? (
          <>
            <h1 className="text-[19px] font-bold tracking-[-0.01em]">This deal was sent to another account</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              This deal was sent to <span className="font-semibold text-foreground">{resolution.maskedEmail}</span>. Sign in
              with that Google account to view it.
            </p>
            <p className="mt-3 text-[12px] text-muted-foreground/70">
              You're signed in as <span className="font-medium">{email}</span>
            </p>
            <Button
              onClick={onSwitch}
              className="mt-5 h-[50px] w-full rounded-xl bg-[#5fd4e7] text-[15px] font-bold text-[#0a0e12] hover:bg-[#7be3f0]"
              data-testid="button-switch-account"
            >
              Switch account
            </Button>
            <Button variant="ghost" onClick={onHome} className="mt-2 h-11 w-full rounded-xl text-[14px]">
              Back to my deals
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-[19px] font-bold tracking-[-0.01em]">This shared deal is no longer available.</h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              It may have been accepted, declined, or the invite expired. Ask the sender to send it again.
            </p>
            <Button onClick={onHome} variant="outline" className="mt-5 h-[50px] w-full rounded-xl text-[15px] font-bold">
              Go to my deals
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ShareLinkPage() {
  const [, params] = useRoute<{ token: string }>("/s/:token");
  const token = params?.token ?? "";
  const [, navigate] = useLocation();
  const { user, signOut } = useAuth();
  const q = useQuery<ShareTokenResolution>({ queryKey: [`/api/shares/by-token/${encodeURIComponent(token)}`], enabled: !!token });

  useEffect(() => {
    if (q.data?.state === "mine" && q.data.shareId != null) {
      try {
        sessionStorage.setItem(HIGHLIGHT_SHARE_KEY, String(q.data.shareId));
      } catch {
        /* ignore */
      }
      navigate("/shared", { replace: true });
    }
  }, [q.data, navigate]);

  if (q.isLoading || q.data?.state === "mine") {
    return (
      <div className="flex justify-center pt-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  const resolution: ShareTokenResolution = q.data ?? { shareId: null, state: "unavailable" };
  return (
    <ShareLinkView
      resolution={resolution}
      email={user?.email ?? ""}
      onHome={() => navigate("/deals")}
      onSwitch={async () => {
        rememberPendingShare(token);
        await signOut();
        // Web: straight to Google's account chooser (prompt=select_account).
        // iOS app: Google is hidden on Login, so the gate shows the magic-link
        // form; the remembered token replays after either sign-in.
        if (!runningInApp()) window.location.href = "/api/auth/google";
      }}
    />
  );
}
