// v1.8.0 Deal Sharing — SMS handoff. PropBoxIQ never sends texts: we open the
// phone's own Messages app with a pre-written body via an `sms:` URI and the
// sender taps send. The phone number is never stored server-side.

/** `sms:+1XXXXXXXXXX?&body=…` — the `?&` form works on both iOS and Android. */
export function buildSmsUri(e164: string, body: string): string {
  return `sms:${e164}?&body=${encodeURIComponent(body)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Open Messages. If the page never loses focus/visibility within `timeoutMs`
 * (desktop browser, no SMS handler), copy the text and call `onFallback` so
 * the UI can toast "Text copied — paste into Messages."
 */
export function openSmsWithFallback(
  e164: string,
  body: string,
  onFallback: (copied: boolean) => void,
  timeoutMs = 1500,
): void {
  let left = false;
  const mark = () => {
    left = true;
  };
  const onVis = () => {
    if (document.visibilityState === "hidden") left = true;
  };
  window.addEventListener("blur", mark);
  window.addEventListener("pagehide", mark);
  document.addEventListener("visibilitychange", onVis);
  try {
    window.location.href = buildSmsUri(e164, body);
  } catch {
    /* no handler — fallback below */
  }
  window.setTimeout(async () => {
    window.removeEventListener("blur", mark);
    window.removeEventListener("pagehide", mark);
    document.removeEventListener("visibilitychange", onVis);
    if (!left) onFallback(await copyText(body));
  }, timeoutMs);
}
