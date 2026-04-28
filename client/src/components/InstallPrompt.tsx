import { useEffect, useState } from "react";
import { Share, Plus, X, Download } from "lucide-react";

/**
 * Cross-platform "Add to Home Screen" prompt.
 *
 * - iOS Safari: shows a custom card with an arrow pointing at the Share button
 *   and step-by-step instructions. (Apple blocks the native beforeinstallprompt
 *   event, so this is the only way to nudge iOS users.)
 * - Android Chrome: captures the real `beforeinstallprompt` event and shows
 *   a one-tap "Install" button that fires the native install dialog.
 * - Other / already installed: renders nothing.
 *
 * Dismissal is remembered in-memory only (not localStorage — sandbox-blocked,
 * see template rules). The banner reappears on full reload, which is fine for
 * beta testers — they only need to see it once anyway.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOSSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
  // Detect Safari-family WebView vs Chrome/Firefox-on-iOS
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS-specific
  if ((window.navigator as any).standalone === true) return true;
  // Standard PWA display mode
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed, do nothing

    // Android / desktop Chrome path
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS Safari path — show the manual-instructions card
    if (isIOSSafari()) {
      // Small delay so it doesn't pop in the same frame as the page
      const t = setTimeout(() => setShowIOS(true), 800);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (dismissed) return null;
  if (isStandalone()) return null;

  // ---------- Android / Chrome ----------
  if (installEvent) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
        data-testid="install-prompt-android"
      >
        <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-card-border bg-card shadow-2xl shadow-black/30 overflow-hidden">
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent shrink-0">
              <Download className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">Install PropBoxIQ</div>
              <div className="text-xs text-muted-foreground">Add to your home screen for fullscreen access</div>
            </div>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground p-1"
              data-testid="button-dismiss-install"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex border-t border-card-border">
            <button
              onClick={() => setDismissed(true)}
              className="flex-1 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50"
              data-testid="button-not-now"
            >
              Not now
            </button>
            <button
              onClick={async () => {
                setInstalling(true);
                try {
                  await installEvent.prompt();
                  const { outcome } = await installEvent.userChoice;
                  if (outcome === "accepted") setDismissed(true);
                } finally {
                  setInstalling(false);
                  setInstallEvent(null);
                }
              }}
              disabled={installing}
              className="flex-1 py-3 text-sm font-semibold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
              data-testid="button-install-now"
            >
              {installing ? "Installing…" : "Install"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- iOS Safari ----------
  if (showIOS) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
        data-testid="install-prompt-ios"
      >
        <div className="relative mx-auto max-w-md pointer-events-auto rounded-2xl border border-card-border bg-card shadow-2xl shadow-black/40 overflow-hidden">
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="absolute right-2 top-2 z-10 text-muted-foreground hover:text-foreground p-2"
            data-testid="button-dismiss-install-ios"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent shrink-0">
                <Download className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Add PropBoxIQ to your home screen</div>
                <div className="text-xs text-muted-foreground">Opens fullscreen, no browser bars</div>
              </div>
            </div>

            <ol className="text-sm text-foreground space-y-2 mt-4">
              <li className="flex items-start gap-2">
                <span className="font-semibold text-accent shrink-0 w-5">1.</span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  Tap the
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium">
                    <Share className="h-3.5 w-3.5" />
                    Share
                  </span>
                  button below
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-accent shrink-0 w-5">2.</span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  Scroll and tap
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-medium">
                    <Plus className="h-3.5 w-3.5" />
                    Add to Home Screen
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-semibold text-accent shrink-0 w-5">3.</span>
                <span>Tap the PropBoxIQ icon on your home screen</span>
              </li>
            </ol>
          </div>

          {/* Arrow pointing toward the Safari Share button at the bottom of the screen */}
          <div className="flex justify-center pb-3">
            <svg width="28" height="22" viewBox="0 0 28 22" fill="none" className="text-accent">
              <path
                d="M14 22L2 6h8V0h8v6h8L14 22z"
                fill="currentColor"
                opacity="0.85"
              />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
