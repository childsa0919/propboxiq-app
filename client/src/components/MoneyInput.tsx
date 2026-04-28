import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  testId?: string;
}

export function MoneyInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  min = 0,
  max,
  hint,
  testId,
}: Props) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {prefix}
          </span>
        )}
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          onFocus={(e) => e.currentTarget.select()}
          className={`tabular-nums ${prefix ? "pl-7" : ""} ${
            suffix ? "pr-10" : ""
          }`}
          data-testid={testId}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
