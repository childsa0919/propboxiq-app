// "What's New" badge state. We persist the last app version the user has seen
// on the Release Notes screen in localStorage and compare it against the running
// APP_VERSION to decide whether to show the gold "NEW" pill.
//
// Fresh installs (no stored key) are treated as "seen" — we seed the key to the
// current version on first read so brand-new users don't see a NEW badge on day 1.

import { APP_VERSION, compareSemver } from "@shared/version";

const KEY = "propboxiq:lastSeenVersion";

function safeGet(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function safeSet(v: string): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* localStorage unavailable (private mode / SSR) — badge just won't persist */
  }
}

/** True when the user hasn't yet opened Release Notes for the current version. */
export function hasUnseenRelease(): boolean {
  const seen = safeGet();
  if (seen == null) {
    // First-time user — seed to current so we don't flag NEW on a fresh install.
    safeSet(APP_VERSION);
    return false;
  }
  return compareSemver(seen, APP_VERSION) < 0;
}

/** Mark the current version as seen (call when Release Notes is opened). */
export function markReleaseSeen(): void {
  safeSet(APP_VERSION);
}
