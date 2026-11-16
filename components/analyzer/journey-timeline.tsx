"use client";

import { useState } from "react";
import { ChevronRight, CircleDot } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { JourneyStep } from "@/types/journey";

import { ResultBadge, confidenceLabel, confidencePercent } from "./shared";
import { StepDetail } from "./step-detail";

const RESULT_DOT: Record<JourneyStep["result"], string> = {
  PASS: "bg-pass",
  FRICTION: "bg-friction",
  SERIOUS: "bg-serious",
  BLOCKED: "bg-serious",
  UNCERTAIN: "bg-info",
};

function StepRow({ step, debug }: { step: JourneyStep; debug: boolean }) {
  const [open, setOpen] = useState(false);
  const finding = step.evaluation.findings[0];
  const confidence = step.evaluation.confidence;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="relative pl-8">
        <span
          className={cn(
            "absolute left-[7px] top-[18px] z-10 size-2.5 rounded-full ring-4 ring-background",
            RESULT_DOT[step.result],
          )}
        />
        <span className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />
        <Card className={cn("transition-shadow", open && "shadow-sm")}>
          <CollapsibleTrigger className="w-full text-left">
            <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <ChevronRight
                    className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
                  />
                  <span className="text-sm font-semibold">
                    {step.step}. {step.title}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {step.action.type} {step.action.role} &quot;{step.action.accessibleName}&quot;
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{step.visualChange}</span>
                </div>
                {finding ? (
                  <div className="pl-6 text-xs text-foreground/80">{finding.title}</div>
                ) : (
                  <div className="pl-6 text-xs text-pass">No semantic issue detected</div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <ResultBadge result={step.result} />
                {step.evaluation.findings.some((finding) => !finding.observation) ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {confidencePercent(confidence)} · {confidenceLabel(confidence)}
                  </span>
                ) : step.evaluation.findings.length > 0 ? (
                  <span className="text-[11px] text-muted-foreground">
                    observation{step.evaluation.findings.length > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">no semantic issue</span>
                )}
              </div>
            </CardContent>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="border-t pt-5">
              <StepDetail step={step} debug={debug} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </div>
    </Collapsible>
  );
}

export function JourneyTimeline({ steps, debug }: { steps: JourneyStep[]; debug: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Journey timeline</h2>
          <p className="text-sm text-muted-foreground">
            Every step is an accessibility state transition: before, action, after, judgment.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 font-mono">
          <CircleDot className="size-3" />
          {steps.length} {steps.length === 1 ? "transition" : "transitions"}
        </Badge>
      </div>
      <div className="space-y-3">
        {steps.map((step) => (
          <StepRow key={`${step.step}-${step.title}`} step={step} debug={debug} />
        ))}
      </div>
    </div>
  );
}
