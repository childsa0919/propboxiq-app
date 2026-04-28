import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppShell } from "@/components/AppShell";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { InstallPrompt } from "@/components/InstallPrompt";
import NotFound from "@/pages/not-found";
import Welcome from "@/pages/Welcome";
import QuickWizard from "@/pages/QuickWizard";
import QuickResult from "@/pages/QuickResult";
import Detailed from "@/pages/Detailed";
import DealPage from "@/pages/Deal";
import Deals from "@/pages/Deals";
import Login from "@/pages/Login";
import { Loader2 } from "lucide-react";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/quick" component={QuickWizard} />
      <Route path="/result/:id" component={QuickResult} />
      <Route path="/detailed" component={Detailed} />
      <Route path="/deal/:id" component={DealPage} />
      <Route path="/deals" component={Deals} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Auth gate. While loading: full-screen spinner.
 * Not signed in: render the Login page (no AppShell).
 * Signed in: render AppShell + routes.
 */
function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <AppShell>
      <AppRouter />
    </AppShell>
  );
}

/**
 * AUTH TOGGLE
 * Auth is temporarily disabled until Google OAuth is wired up. The full magic-link
 * implementation is preserved (AuthProvider, AuthGate, Login page, server routes) —
 * to re-enable, flip AUTH_ENABLED to true and re-deploy.
 */
const AUTH_ENABLED = false;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <InstallPrompt />
          <Router hook={useHashLocation}>
            {AUTH_ENABLED ? (
              <AuthProvider>
                <AuthGate />
              </AuthProvider>
            ) : (
              <AppShell>
                <AppRouter />
              </AppShell>
            )}
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
