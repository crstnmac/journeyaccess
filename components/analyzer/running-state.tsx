"use client";

import { Check, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JourneyStep } from "@/types/journey";

import { ResultBadge } from "./shared";

const PHASES = [
  { id: "launch", label: "Launch browser" },
  { id: "capture", label: "Capture accessibility state" },
  { id: "select", label: "Find next accessible action" },
  { id: "act", label: "Execute action" },
  { id: "evaluate", label: "Evaluate transition" },
  { id: "done", label: "Complete analysis" },
];

const PHASE_ORDER = PHASES.map((phase) => phase.id);

function phaseIndex(phase: string): number {
  const index = PHASE_ORDER.indexOf(phase);
  return index === -1 ? 0 : index;
}

export function RunningState({
  phase,
  message,
  steps,
  goal,
}: {
  phase: string;
  message: string;
  steps: JourneyStep[];
  goal: string;
}) {
  const current = phaseIndex(phase);

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-info" />
          <span className="text-sm font-medium">Analyzing semantic journey</span>
          <Badge variant="info" className="font-mono text-[11px]">
            {steps.length} {steps.length === 1 ? "step" : "steps"} captured
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Goal: <span className="text-foreground">{goal}</span>
        </p>

        <ol className="space-y-2">
          {PHASES.map((entry, index) => {
            const done = index < current || (phase === "done" && index <= current);
            const active = index === current && phase !== "done";
            return (
              <li key={entry.id} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[11px]",
                    done && "border-pass bg-pass/10 text-pass",
                    active && "border-info text-info",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3" /> : index + 1}
                </span>
                <span className={cn(active && "font-medium", !done && !active && "text-muted-foreground")}>
                  {entry.label}
                </span>
                {active ? <span className="pulse-dot size-1.5 rounded-full bg-info" /> : null}
              </li>
            );
          })}
        </ol>

        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{message}</p>

        {steps.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Completed transitions</div>
            {steps.map((step) => (
              <div
                key={step.step}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span className="text-xs">
                  {step.step}. {step.title}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{step.visualChange}</span>
                  <ResultBadge result={step.result} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
