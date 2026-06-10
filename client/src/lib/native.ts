/**
 * Native bridges (Capacitor) — safely no-op on web.
 *
 * All exports are async and tolerant of running outside Capacitor (web build).
 * That way the same React code runs in the browser and inside the iOS shell.
 *
 * Apple's App Review Guideline 4.2 ("Minimum Functionality") is the main
 * reason these exist — pure web wrappers get rejected. Light/haptic/share
 * native touches are usually enough to clear review.
 */

function isNative(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      (window as any).Capacitor?.isNativePlatform?.(),
  );
}

export type HapticIntensity = "light" | "medium" | "heavy" | "selection";

/** Fire haptic feedback on supported devices. No-op on web. */
export async function haptic(intensity: HapticIntensity = "light"): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    if (intensity === "selection") {
      await Haptics.selectionStart();
      await Haptics.selectionEnd();
      return;
    }
    const style =
      intensity === "heavy"
        ? ImpactStyle.Heavy
        : intensity === "medium"
          ? ImpactStyle.Medium
          : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {
    /* ignore */
  }
}

/**
 * Native share sheet (iOS share UI). Falls back to web Web Share API,
 * then to a clipboard copy if neither is available.
 */
export async function share(opts: {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}): Promise<{ shared: boolean; via: "native" | "web-share" | "clipboard" | "none" }> {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.dialogTitle ?? "Share deal",
      });
      return { shared: true, via: "native" };
    } catch {
      /* fall through */
    }
  }
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return { shared: true, via: "web-share" };
    } catch {
      /* user cancelled or unsupported */
    }
  }
  if (
    typeof navigator !== "undefined" &&
    (navigator as any).clipboard &&
    opts.url
  ) {
    try {
      await (navigator as any).clipboard.writeText(opts.url);
      return { shared: true, via: "clipboard" };
    } catch {
      /* ignore */
    }
  }
  return { shared: false, via: "none" };
}

/**
 * Open an external URL (e.g. OAuth) in the in-app Safari View Controller.
 * Returns control once the user dismisses the browser.
 *
 * On web, just navigates the current tab — which is fine because there's no
 * deep-link interception needed.
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
      return;
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
}

/**
 * Subscribe to deep links delivered to the app (e.g. propboxiq://auth/callback
 * after Google OAuth). Returns a cleanup function. On web, returns a no-op.
 */
export function onAppUrl(
  handler: (url: string) => void,
): () => void {
  if (!isNative()) return () => {};
  let cleanup: (() => void) | null = null;
  (async () => {
    try {
      const { App } = await import("@capacitor/app");
      const sub = await App.addListener("appUrlOpen", (event) => {
        if (event?.url) handler(event.url);
      });
      cleanup = () => sub.remove();
    } catch {
      /* ignore */
    }
  })();
  return () => {
    cleanup?.();
  };
}

/** Hide the launch splash screen — call once the React app is interactive. */
export async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* ignore */
  }
}

/** True when running inside the iOS shell. Useful for UI gating. */
export function runningInApp(): boolean {
  return isNative();
}
