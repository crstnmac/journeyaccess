import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StepResult } from "@/types/journey";

export function confidenceLabel(value: number): string {
  if (value >= 0.9) return "High confidence";
  if (value >= 0.7) return "Medium confidence";
  return "Needs human review";
}

export function confidencePercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function ConfidenceMeter({
  value,
  className,
  showLabel = true,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) {
  const tone = value >= 0.9 ? "bg-pass" : value >= 0.7 ? "bg-friction" : "bg-serious";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{showLabel ? confidenceLabel(value) : "Confidence"}</span>
        <span className="font-mono tabular-nums">{confidencePercent(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  );
}

const RESULT_VARIANT: Record<StepResult, "pass" | "friction" | "serious" | "info" | "muted"> = {
  PASS: "pass",
  FRICTION: "friction",
  SERIOUS: "serious",
  BLOCKED: "serious",
  UNCERTAIN: "info",
};

export function ResultBadge({ result }: { result: StepResult }) {
  return (
    <Badge variant={RESULT_VARIANT[result]} className="uppercase tracking-wide">
      {result}
    </Badge>
  );
}

const IMPACT_VARIANT = {
  friction: "friction",
  serious: "serious",
  blocking: "serious",
} as const;

export function ImpactBadge({ impact }: { impact: "friction" | "serious" | "blocking" | "none" }) {
  if (impact === "none") return <Badge variant="pass">No impact</Badge>;
  return (
    <Badge variant={IMPACT_VARIANT[impact]} className="uppercase tracking-wide">
      {impact}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "complete"
      ? "pass"
      : status === "complete_with_friction"
        ? "friction"
        : status === "blocked" || status === "error"
          ? "serious"
          : "info";
  const label = status.replaceAll("_", " ");
  return (
    <Badge variant={variant} className="uppercase tracking-wide">
      {label}
    </Badge>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {badge}
    </div>
  );
}
