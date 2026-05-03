/**
 * PREVIEW MODE — temporary auth bypass for Render PR previews.
 *
 * Activates when EITHER:
 *   1. The URL contains `?preview=1` on first load (sticky for the session via sessionStorage).
 *   2. The build was served with PREVIEW_MODE=1 in the server env (the server then also
 *      treats every request as the fake preview user so writes/email work).
 *
 * To revert: delete this file and the references in AuthProvider, AppShell,
 * and server/auth.ts (search "PREVIEW_MODE" / "previewMode").
 */
import type { CurrentUser } from "@/components/AuthProvider";

const STORAGE_KEY = "pbq_preview_mode";

export const PREVIEW_USER: CurrentUser = {
  id: 0,
  email: "info@propboxiq.com",
  name: "Preview User",
};

function readQueryFlag(): boolean {
  if (typeof window === "undefined") return false;
  // Hash-based router puts real query string before the hash on first load.
  const search = window.location.search || "";
  if (/[?&]preview=1\b/.test(search)) return true;
  // Some hosts may forward it after the hash (e.g. /#/?preview=1).
  const hash = window.location.hash || "";
  if (/[?&]preview=1\b/.test(hash)) return true;
  return false;
}

export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (readQueryFlag()) {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return readQueryFlag();
  }
}
