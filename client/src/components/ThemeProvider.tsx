import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface Ctx {
  theme: Theme;
  toggle: () => void;
}

const ThemeCtx = createContext<Ctx>({ theme: "light", toggle: () => {} });

const STORAGE_KEY = "propboxiq:theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* localStorage unavailable — fall through to system pref */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  // Track whether the user has explicitly chosen a theme (vs. inheriting system).
  const [hasUserChoice, setHasUserChoice] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  // Follow the system preference until the user manually toggles.
  useEffect(() => {
    if (hasUserChoice) return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [hasUserChoice]);

  return (
    <ThemeCtx.Provider
      value={{
        theme,
        toggle: () =>
          setTheme((t) => {
            const next = t === "dark" ? "light" : "dark";
            try {
              window.localStorage.setItem(STORAGE_KEY, next);
            } catch {
              /* ignore */
            }
            setHasUserChoice(true);
            return next;
          }),
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
