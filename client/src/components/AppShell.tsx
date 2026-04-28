import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun, LogOut, User as UserIcon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useAuth } from "./AuthProvider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const isHome = location === "/" || location === "";

  // Initials for the avatar
  const initials = (() => {
    if (!user?.email) return "?";
    const e = user.email;
    return e.charAt(0).toUpperCase();
  })();

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-card-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-foreground hover-elevate rounded-md px-2 py-1 -mx-2"
            data-testid="link-home"
          >
            <Logo size={26} />
            <span className="font-display font-bold tracking-tight text-[15px]">
              PropBox<span style={{ color: "#126D85" }}>IQ</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {!isHome && (
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="link-deals">
                  Deals
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full
                               bg-[hsl(192_76%_30%)] text-white text-xs font-semibold
                               hover:opacity-90 transition-opacity
                               ring-1 ring-[hsl(192_76%_30%/0.30)]"
                    aria-label="Account menu"
                    data-testid="button-user-menu"
                  >
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-60"
                  data-testid="menu-user"
                >
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Signed in as
                        </div>
                        <div
                          className="text-sm font-medium truncate"
                          data-testid="text-user-email"
                        >
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut()}
                    data-testid="button-sign-out"
                    className="cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-card-border py-6 text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <span>PropBoxIQ · Smart flip analysis</span>
          <span>
            Address data via U.S. Census Geocoder · Maps © OpenStreetMap
          </span>
        </div>
      </footer>
    </div>
  );
}
