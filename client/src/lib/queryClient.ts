import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Resolve the API base URL.
 *
 * Priority:
 *   1. Capacitor (iOS app) — always hit https://propboxiq.com (the prod API).
 *   2. VITE_API_BASE build-time env (set by mobile builds or staging).
 *   3. Legacy Replit-style "__PORT_5000__" placeholder substitution.
 *   4. Empty string — relative URLs (same-origin web).
 */
function resolveApiBase(): string {
  // Capacitor exposes window.Capacitor when running inside the native shell.
  if (
    typeof window !== "undefined" &&
    (window as any).Capacitor?.isNativePlatform?.()
  ) {
    return "https://propboxiq.com";
  }
  const env = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (env && env.length > 0) return env;
  const legacy = "__PORT_5000__";
  if (!legacy.startsWith("__")) return legacy;
  return "";
}

const API_BASE = resolveApiBase();

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
