import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DealTypeGateway, type DealType } from "@/components/DealTypeGateway";

const STEP_COUNT = 5;

/**
 * /hold — the Hold underwriting flow. For v1.4.2.0-coastal this is a stub:
 * the deal-type gateway (pre-selected to Hold) plus a placeholder for the
 * Hold wizard, which PR-B (v1.4.3.0) will replace with the real steps.
 */
export default function Hold() {
  const [, navigate] = useLocation();
  const [passedGateway, setPassedGateway] = useState(false);

  function handleContinue(type: DealType) {
    if (type === "flip") {
      navigate("/quick");
      return;
    }
    setPassedGateway(true);
  }

  return (
    <div
      className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10"
      style={{ paddingBottom: "calc(8rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (passedGateway ? setPassedGateway(false) : navigate("/"))}
          data-testid="button-back"
          className="-ml-3"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {passedGateway ? "Back" : "Home"}
        </Button>
        <span className="mono-eyebrow text-[11px] tracking-[0.18em]">
          Step {passedGateway ? 2 : 1} of {STEP_COUNT}
        </span>
        <span className="w-12" />
      </div>

      <div
        className="glass-card relative overflow-hidden"
        style={{ padding: "26px 22px 22px" }}
      >
        <div className="flex min-h-[380px] flex-col">
          {passedGateway ? (
            <HoldWizardPlaceholder />
          ) : (
            <DealTypeGateway defaultType="hold" onContinue={handleContinue} />
          )}
        </div>
      </div>
    </div>
  );
}

function HoldWizardPlaceholder() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center text-center"
      data-testid="hold-placeholder"
    >
      <div className="mono-eyebrow mb-3 text-[10px] tracking-[0.16em]">Hold</div>
      <h1 className="mb-2 font-display text-[24px] font-bold tracking-[-0.02em] text-foreground">
        Hold flow shipping in v1.4.3.0
      </h1>
      <p className="max-w-sm text-[13px] leading-[1.5] text-muted-foreground">
        Rent, expenses, DSCR, and long-term upside scoring are on the way.
      </p>
    </div>
  );
}
