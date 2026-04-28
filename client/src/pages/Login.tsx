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
