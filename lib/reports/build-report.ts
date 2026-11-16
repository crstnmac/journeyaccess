import type { AxeFinding } from "@/types/accessibility";
import type { JourneyMode, JourneyStep } from "@/types/journey";
import type { JourneyReport, JourneyStatus, SemanticFinding } from "@/types/analysis";

function createReportId(): string {
  return `journey-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveStatus(steps: JourneyStep[]): JourneyStatus {
  // Only a final blocked step means the journey could not continue; a blocked
  // step that was recovered from still counts as friction.
  if (steps.length > 0 && steps[steps.length - 1].result === "BLOCKED") return "blocked";
  if (steps.some((step) => step.result === "SERIOUS" || step.result === "FRICTION")) {
    return "complete_with_friction";
  }
  if (steps.some((step) => step.result === "UNCERTAIN")) return "uncertain";
  return "complete";
}

function resultSentence(status: JourneyStatus): string {
  switch (status) {
    case "complete":
      return "The journey completed without detected semantic friction.";
    case "complete_with_friction":
      return "The journey completed, but semantic friction was detected along the way.";
    case "blocked":
      return "The journey was blocked before reaching the goal.";
    case "uncertain":
      return "The journey finished with steps that need manual review.";
    case "error":
      return "The journey ended with an error before completion.";
  }
}

/**
 * Semantic findings are deduplicated across steps: the same underlying issue
 * (same category and title) is reported once, with recurrence noted in the
 * evidence. This keeps the report focused on distinct problems.
 */
function collectSemanticFindings(steps: JourneyStep[]): SemanticFinding[] {
  const byKey = new Map<string, SemanticFinding>();

  for (const step of steps) {
    for (const finding of step.evaluation.findings) {
      const key = `${finding.category}:${finding.title}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          ...finding,
          id: `finding-${step.step}-${byKey.size + 1}`,
          step: step.step,
          evidence: finding.evidence.slice(0, 6),
        });
        continue;
      }
      if (existing.step !== step.step) {
        const recurrence = `Also observed in step ${step.step}`;
        if (!existing.evidence.includes(recurrence) && existing.evidence.length < 6) {
          existing.evidence.push(recurrence);
        }
      }
      existing.confidence = Math.max(existing.confidence, finding.confidence);
      if (finding.impact === "blocking" || finding.impact === "serious") {
        existing.impact = finding.impact;
      }
    }
  }

  return [...byKey.values()].map((finding, index) => ({
    ...finding,
    id: `finding-${finding.step}-${index + 1}`,
  }));
}

const MAX_NODES_PER_RULE = 5;

function mergeAxeFindings(findings: AxeFinding[]): AxeFinding[] {
  const byRule = new Map<string, AxeFinding>();
  for (const finding of findings) {
    const existing = byRule.get(finding.id);
    if (!existing) {
      byRule.set(finding.id, { ...finding, nodes: finding.nodes.slice(0, MAX_NODES_PER_RULE) });
      continue;
    }
    const seen = new Set(existing.nodes.map((node) => `${node.target.join(" ")}|${node.html}`));
    for (const node of finding.nodes) {
      if (existing.nodes.length >= MAX_NODES_PER_RULE) break;
      const key = `${node.target.join(" ")}|${node.html}`;
      if (seen.has(key)) continue;
      seen.add(key);
      existing.nodes.push(node);
    }
  }
  return [...byRule.values()];
}

export function buildReport(input: {
  url: string;
  goal: string;
  mode: JourneyMode;
  steps: JourneyStep[];
  axeFindings: AxeFinding[];
  startedAt: string;
  durationMs: number;
  status?: JourneyStatus;
  error?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
}): JourneyReport {
  const {
    url,
    goal,
    mode,
    steps,
    axeFindings,
    startedAt,
    durationMs,
    status,
    error,
    fallbackUsed,
    fallbackReason,
  } = input;

  const semanticFindings = collectSemanticFindings(steps);
  const mergedAxeFindings = mergeAxeFindings(axeFindings);
  const finalStatus = status ?? deriveStatus(steps);

  const manualReviewSteps = steps.filter(
    (step) => step.evaluation.requiresManualReview || step.result === "UNCERTAIN",
  ).length;
  const requiresManualReview = manualReviewSteps > 0;

  const summary = [
    `Goal: ${goal}`,
    resultSentence(finalStatus),
    `${steps.length} actions`,
    `${semanticFindings.length} semantic issues`,
    `${mergedAxeFindings.length} axe issues`,
    `${manualReviewSteps} manual-review recommendation${manualReviewSteps === 1 ? "" : "s"}`,
  ];
  if (fallbackUsed) {
    summary.push(
      `Semantic judge fallback used${fallbackReason ? `: ${fallbackReason}` : ""}.`,
    );
  }
  if (error) summary.push(`Error: ${error}`);

  return {
    id: createReportId(),
    target: { url, goal, mode },
    startedAt,
    durationMs,
    status: finalStatus,
    steps,
    semanticFindings,
    axeFindings: mergedAxeFindings,
    requiresManualReview,
    fallbackUsed,
    fallbackReason,
    summary,
    error,
  };
}

export function renderReportText(report: JourneyReport): string {
  const lines: string[] = [];

  lines.push("Semantic Journey report");
  lines.push(`Report: ${report.id}`);
  lines.push(`URL: ${report.target.url}`);
  lines.push(`Goal: ${report.target.goal}`);
  lines.push(`Mode: ${report.target.mode}`);
  lines.push(`Status: ${report.status}`);
  lines.push(`Started: ${report.startedAt}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push(`Manual review: ${report.requiresManualReview ? "required" : "not required"}`);
  if (report.error) lines.push(`Error: ${report.error}`);
  if (report.fallbackUsed) {
    lines.push(`Fallback: ${report.fallbackReason ?? "deterministic fallback used"}`);
  }

  lines.push("");
  lines.push("Summary:");
  for (const line of report.summary) lines.push(`- ${line}`);

  lines.push("");
  lines.push(`Steps (${report.steps.length}):`);
  for (const step of report.steps) {
    lines.push(`${step.step}. ${step.title} [${step.result}]`);
    const actionLabel = [step.action.type, step.action.role, step.action.accessibleName]
      .filter(Boolean)
      .join(" ");
    lines.push(`   Action: ${actionLabel}`);
    lines.push(`   Visual: ${step.visualChange}`);
    lines.push(`   Semantic: ${step.semanticChange}`);
    lines.push(`   URL: ${step.urlBefore} -> ${step.urlAfter} (${step.durationMs}ms)`);
    for (const finding of step.evaluation.findings) {
      lines.push(
        `   Finding [${finding.impact}] ${finding.title} (confidence ${finding.confidence.toFixed(2)})`,
      );
    }
  }

  lines.push("");
  lines.push(`Semantic findings (${report.semanticFindings.length}):`);
  for (const finding of report.semanticFindings) {
    lines.push(`- step ${finding.step} [${finding.impact}] ${finding.title}`);
    if (finding.evidence.length > 0) {
      lines.push(`  Evidence: ${finding.evidence.join(" | ")}`);
    }
    lines.push(`  Recommendation: ${finding.recommendation}`);
  }

  lines.push("");
  lines.push(`Axe findings (${report.axeFindings.length}):`);
  for (const finding of report.axeFindings) {
    lines.push(
      `- ${finding.id} [${finding.impact ?? "unknown"}] ${finding.help} (${finding.nodes.length} node${finding.nodes.length === 1 ? "" : "s"})`,
    );
  }

  return lines.join("\n");
}
