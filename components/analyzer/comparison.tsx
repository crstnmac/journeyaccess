import { ArrowRight, Check, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { JourneyReport } from "@/types/analysis";
import type { AXNode } from "@/types/accessibility";
import type { JourneyStep } from "@/types/journey";

import { ResultBadge } from "./shared";

function dialogNode(step: JourneyStep): AXNode | undefined {
  return step.transition.after.axTree.find(
    (node) => node.role === "dialog" || node.role === "alertdialog",
  );
}

function focusInsideDialog(step: JourneyStep): boolean {
  const focused = step.transition.after.axTree.find((node) => node.focused);
  if (!focused) return false;
  let current: AXNode | undefined = focused;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.role === "dialog" || current.role === "alertdialog") return true;
    const parentId: string | undefined = current.parentId;
    current = parentId
      ? step.transition.after.axTree.find((node) => node.id === parentId)
      : undefined;
  }
  return false;
}

function focusText(focus: JourneyStep["transition"]["after"]["focus"]): string {
  if (!focus) return "none";
  const role = focus.role ?? "element";
  return focus.name ? `${role} "${focus.name}"` : role;
}

function FocusVerdict({ step }: { step: JourneyStep }) {
  const dialog = dialogNode(step);
  const inside = focusInsideDialog(step);
  const before = focusText(step.transition.before.focus);
  const after = focusText(step.transition.after.focus);

  const focusRole = step.transition.after.focus?.role ?? "";
  const resetToPageRoot = (focusRole === "body" || focusRole === "html") && step.urlBefore !== step.urlAfter;

  let verdict: { tone: "pass" | "serious" | "muted"; text: string };
  if (dialog && inside) {
    verdict = { tone: "pass", text: "focus moved into the dialog" };
  } else if (step.visualChange === "Overlay appeared" && !inside) {
    verdict = { tone: "serious", text: "focus stayed on the underlying trigger" };
  } else if (resetToPageRoot) {
    verdict = { tone: "muted", text: "focus reset to the page root (expected after navigation)" };
  } else if (before !== after) {
    verdict = { tone: "muted", text: "focus moved" };
  } else {
    verdict = { tone: "muted", text: "focus unchanged" };
  }

  const toneClass =
    verdict.tone === "pass"
      ? "text-pass"
      : verdict.tone === "serious"
        ? "text-serious"
        : "text-muted-foreground";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <span className="text-muted-foreground">{before}</span>
        <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
        <span>{after}</span>
      </div>
      <div className={`flex items-center gap-1 text-[11px] ${toneClass}`}>
        {verdict.tone === "pass" ? <Check className="size-3" /> : null}
        {verdict.tone === "serious" ? <X className="size-3" /> : null}
        {verdict.text}
      </div>
    </div>
  );
}

function Column({ step }: { step: JourneyStep | undefined }) {
  if (!step) {
    return <span className="text-xs text-muted-foreground">No corresponding step.</span>;
  }

  const dialog = dialogNode(step);
  const feedback = step.evaluation.judgments.feedback_exposed;
  const showFeedback =
    feedback !== undefined &&
    (feedback.value === false || /confirmation/i.test(step.visualChange));
  const showDialog = dialog !== undefined || step.visualChange === "Overlay appeared";
  const finding = step.evaluation.findings.find((entry) => !entry.observation) ?? step.evaluation.findings[0];

  return (
    <div className="space-y-2.5">
      <ResultBadge result={step.result} />
      <FocusVerdict step={step} />

      {showFeedback ? (
        <div
          className={`flex items-center gap-1 text-[11px] ${feedback?.value ? "text-pass" : "text-serious"}`}
        >
          {feedback?.value ? <Check className="size-3" /> : <X className="size-3" />}
          {feedback?.value
            ? "status feedback exposed"
            : "feedback not exposed through a live region or status role"}
        </div>
      ) : null}

      {showDialog ? (
        <div className={`flex items-center gap-1 text-[11px] ${dialog ? "text-pass" : "text-serious"}`}>
          {dialog ? <Check className="size-3" /> : <X className="size-3" />}
          {dialog
            ? `dialog exposed${dialog.name ? ` ("${dialog.name}")` : " without an accessible name"}`
            : "no dialog semantics exposed"}
        </div>
      ) : null}

      {finding ? (
        <div className="text-xs text-foreground/85">
          <span className="font-medium">{finding.title}</span>
          <div className="text-[11px] text-muted-foreground">
            confidence {Math.round(finding.confidence * 100)}%
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-xs text-pass">
          <Check className="size-3" />
          No semantic issue detected
        </div>
      )}
    </div>
  );
}

export function Comparison({
  broken,
  fixed,
}: {
  broken: JourneyReport;
  fixed: JourneyReport;
}) {
  const rows = Math.max(broken.steps.length, fixed.steps.length);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Broken versus fixed</h2>
          <p className="text-sm text-muted-foreground">
            The same journey against the same UI, with only the accessibility implementation changed.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={broken.semanticFindings.length > 0 ? "serious" : "pass"}>
            broken: {broken.semanticFindings.length} semantic issues
          </Badge>
          <Badge variant={fixed.semanticFindings.length > 0 ? "serious" : "pass"}>
            fixed: {fixed.semanticFindings.length} semantic issues
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-[130px_1fr_1fr] gap-x-5 text-xs">
            <div className="pb-2 font-medium text-muted-foreground">Step</div>
            <div className="pb-2 font-medium text-serious">
              Broken <span className="font-normal text-muted-foreground">({broken.target.mode})</span>
            </div>
            <div className="pb-2 font-medium text-pass">
              Fixed <span className="font-normal text-muted-foreground">({fixed.target.mode})</span>
            </div>
            {Array.from({ length: rows }).map((_, index) => {
              const brokenStep = broken.steps[index];
              const fixedStep = fixed.steps[index];
              return (
                <div key={index} className="col-span-3 grid grid-cols-[130px_1fr_1fr] gap-x-5 border-t py-4">
                  <div className="text-xs font-medium">
                    {index + 1}. {brokenStep?.title ?? fixedStep?.title ?? "Step"}
                  </div>
                  <Column step={brokenStep} />
                  <Column step={fixedStep} />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
