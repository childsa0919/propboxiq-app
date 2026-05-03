import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type CurrentUser = {
  id: number;
  email: string;
  name: string | null;
};

type Ctx = {
  user: CurrentUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useQuery<{ user: CurrentUser | null }>({
    queryKey: ["/api/auth/me"],
    staleTime: 1000 * 60 * 5,
  });

  const value: Ctx = {
    user: data?.user ?? null,
    isLoading,
    signOut: async () => {
      await apiRequest("POST", "/api/auth/logout");
      // Wipe cached user + deals
      queryClient.setQueryData(["/api/auth/me"], { user: null });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const v = useContext(AuthContext);
  // Auth disabled (no provider) — return a benign null user so consumers don't crash.
  if (!v) {
    return {
      user: null,
      isLoading: false,
      signOut: async () => {},
    };
  }
  return v;
}
