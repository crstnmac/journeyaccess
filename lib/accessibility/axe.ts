import AxeBuilder from "@axe-core/playwright";
import type { Page } from "playwright";
import type { AxeFinding, AxeSummary } from "@/types/accessibility";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function emptySummary(): AxeSummary {
  return {
    findings: [],
    violationCount: 0,
    passCount: 0,
    incompleteCount: 0,
    timestamp: new Date().toISOString(),
  };
}

/** Run axe; failures degrade to an empty summary rather than killing a journey. */
export async function runAxe(page: Page): Promise<AxeSummary> {
  try {
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const findings: AxeFinding[] = results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: node.target.map(String),
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    }));
    return {
      findings,
      violationCount: results.violations.length,
      passCount: results.passes.length,
      incompleteCount: results.incomplete.length,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return emptySummary();
  }
}

/** Human readable axe lines: `serious: button-name — ... (1 node)`. */
export function summarizeAxe(summary: AxeSummary): string[] {
  return summary.findings.map((finding) => {
    const impact = finding.impact ?? "unknown";
    const nodes = finding.nodes.length === 1 ? "1 node" : `${finding.nodes.length} nodes`;
    return `${impact}: ${finding.id} — ${finding.help} (${nodes})`;
  });
}
