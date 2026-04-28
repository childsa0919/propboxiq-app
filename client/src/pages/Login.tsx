import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { Mail, ArrowRight, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

type Phase = "enter" | "sent";

export default function Login() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("enter");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/request", { email: trimmed });
      const json = await res.json();
      if (json?.ok) {
        setPhase("sent");
      } else {
        setError(json?.error ?? "Something went wrong.");
      }
    } catch (err: any) {
      setError(err?.message ?? "Could not send email.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      {/* Aurora wash backdrop, matching Welcome */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] overflow-hidden"
      >
        <div className="absolute inset-0 bg-[hsl(192_76%_30%_/_0.05)]" />
        <div
          className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, hsl(192 76% 30% / 0.55), transparent 70%)",
          }}
        />
        <div
          className="absolute top-32 -left-40 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, hsl(178 70% 42% / 0.50), transparent 70%)",
          }}
        />
      </div>

      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          {/* Brand */}
          <div className="flex items-center justify-center gap-2 mb-10">
            <Logo size={36} />
            <span className="font-display font-bold tracking-tight text-[20px]">
              PropBox<span style={{ color: "#126D85" }}>IQ</span>
            </span>
          </div>

          {phase === "enter" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-card-border bg-card/95 backdrop-blur-md p-7 sm:p-8 shadow-[0_18px_60px_-20px_rgba(10,14,18,0.18)]"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(192_76%_30%_/_0.10)] text-[hsl(192_76%_30%)] dark:text-[#2dd4bf] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] mb-5">
                <Sparkles className="h-3 w-3" />
                Sign in
              </div>
              <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] leading-[1.1] mb-2">
                Welcome to PropBoxIQ
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                Enter your email and we'll send you a one-tap sign-in link.
                No password to remember.
              </p>

              {/* Primary: Google OAuth */}
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-3 w-full h-11 rounded-md border border-card-border bg-white hover:bg-slate-50 dark:bg-card dark:hover:bg-card/80 text-foreground font-medium text-[15px] transition-colors mb-4"
                data-testid="button-continue-google"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z"/>
                </svg>
                Continue with Google
              </a>

              {/* Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-card-border" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  or email link
                </span>
                <div className="flex-1 h-px bg-card-border" />
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-11"
                    data-testid="input-email"
                    disabled={submitting}
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full h-11 text-[15px] font-semibold"
                  disabled={submitting || email.trim().length === 0}
                  data-testid="button-send-link"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending link…
                    </>
                  ) : (
                    <>
                      Send sign-in link
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-[11px] text-muted-foreground mt-5 leading-relaxed">
                By signing in you agree to use PropBoxIQ for screening only.
                Site-intelligence data is informational; confirm with the
                relevant local authority before acting.
              </p>
            </motion.div>
          )}

          {phase === "sent" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl border border-card-border bg-card/95 backdrop-blur-md p-7 sm:p-8 shadow-[0_18px_60px_-20px_rgba(10,14,18,0.18)] text-center"
            >
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-[hsl(192_76%_30%_/_0.12)] text-[hsl(192_76%_30%)] dark:text-[#2dd4bf] mb-5">
                <CheckCircle2 className="h-6 w-6" strokeWidth={2.2} />
              </div>
              <h1 className="font-display text-[1.5rem] font-semibold tracking-[-0.025em] leading-[1.15] mb-2">
                Check your inbox
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                We sent a sign-in link to
              </p>
              <p
                className="text-[15px] font-semibold mb-5 break-all"
                data-testid="text-sent-email"
              >
                {email}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                The link expires in 30 minutes and can only be used once.
                If you don't see it, check your spam folder.
              </p>
              <button
                type="button"
                onClick={() => {
                  setPhase("enter");
                  setError(null);
                }}
                className="text-sm text-[hsl(192_76%_30%)] dark:text-[#2dd4bf] font-medium hover:underline underline-offset-4"
                data-testid="button-different-email"
              >
                Use a different email
              </button>
            </motion.div>
          )}
        </div>
      </main>

      <footer className="relative border-t border-card-border py-6 text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <span>PropBoxIQ · Smart flip analysis</span>
          <span>Address data · U.S. Census Geocoder</span>
        </div>
      </footer>
    </div>
  );
}
