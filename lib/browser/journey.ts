import type { Page } from "playwright";
import type {
  AXNode,
  AXTreeDiff,
  AxeFinding,
  AxeSummary,
  FocusSnapshot,
  MutationSummary,
} from "@/types/accessibility";
import type {
  CandidateAction,
  JourneyEvent,
  JourneyMode,
  JourneyStep,
  SemanticAction,
  SemanticTransition,
  StepResult,
} from "@/types/journey";
import type { JourneyReport, JourneyStatus, SemanticFinding } from "@/types/analysis";
import type { ActionSelection, SemanticJudge, TransitionEvaluation } from "@/lib/jev/types";
import { MIN_IMPACT_CONFIDENCE } from "@/lib/jev/types";

import { closeBrowser, JOURNEY_LIMITS, launchBrowser, withTimeout, type BrowserSession } from "./runner";
import { buildCandidates, describeCandidate } from "./candidates";
import { describeAction, executeCandidate, waitForStability } from "./actions";
import { captureAXTree } from "@/lib/accessibility/capture-ax-tree";
import { normalizeAXTree, treeEvidence } from "@/lib/accessibility/normalize-tree";
import { diffAXTrees } from "@/lib/accessibility/diff-tree";
import { captureFocus, describeFocus, focusFromAXTree, mergeFocus } from "@/lib/accessibility/focus";
import { describeVisualChange, installMutationObserver, readMutations } from "@/lib/accessibility/mutations";
import { runAxe } from "@/lib/accessibility/axe";
import { createJudge, judgeStatus } from "@/lib/jev/provider";
import { buildTransitionEvidence } from "@/lib/jev/signals";
import { buildReport } from "@/lib/reports/build-report";

export const DEFAULT_GOAL =
  "Find Wireless Headphones, add them to the cart, open the cart, and continue toward checkout.";

export type RunJourneyOptions = {
  url: string;
  goal: string;
  mode: JourneyMode;
  judge?: SemanticJudge;
  onEvent?: (event: JourneyEvent) => void;
  /**
   * Called with the live page while the journey runs and with null when it
   * ends. Used by the UI to stream frames of the browser.
   */
  onPage?: (page: Page | null) => void;
  maxActions?: number;
};

const GOAL_STOPWORDS = new Set([
  "the", "and", "to", "of", "a", "an", "in", "on", "for", "with", "then", "that",
  "this", "these", "those", "your", "you", "it", "its", "is", "are", "was", "were",
  "be", "been", "being", "by", "from", "or", "as", "at", "into", "onto", "toward",
  "towards", "until", "while", "when", "where", "which", "who", "whom", "whose",
  "will", "would", "can", "could", "should", "may", "might", "must", "do", "does",
  "did", "have", "has", "had", "my", "our", "their", "his", "her", "them", "they",
  "we", "he", "she", "me", "us", "if", "so", "but", "not", "no", "yes", "all",
  "any", "each", "more", "most", "other", "some", "such", "only", "own", "same",
  "than", "too", "very", "just", "also", "up", "out", "over", "under", "again",
  "off", "down",
]);

const KNOWN_GOAL_PHRASES = ["wireless headphones", "checkout", "cart"];

const MODAL_LIKE_PATTERN = /modal|dialog|overlay|drawer|sheet/i;

export function extractGoalKeywords(goal: string): string[] {
  const words = goal.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const keywords = new Set<string>();
  for (const word of words) {
    if (word.length > 3 && !GOAL_STOPWORDS.has(word)) keywords.add(word);
  }
  const lower = goal.toLowerCase();
  for (const phrase of KNOWN_GOAL_PHRASES) {
    if (lower.includes(phrase)) keywords.add(phrase);
  }
  return [...keywords];
}

type Snapshot = {
  tree: AXNode[];
  focus: FocusSnapshot | null;
  screenshot?: string;
};

async function captureScreenshot(page: Page): Promise<string | undefined> {
  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 60, fullPage: false });
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Captures the current state. Trees are stored normalized; raw trees are debug-only. */
async function captureSnapshot(page: Page): Promise<Snapshot> {
  const raw = await captureAXTree(page);
  const tree = normalizeAXTree(raw);
  const domFocus = await captureFocus(page).catch(() => null);
  const focus = mergeFocus(domFocus, focusFromAXTree(tree));
  const screenshot = await captureScreenshot(page);
  return { tree, focus, screenshot };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function titleFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Untitled step";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function emptyTreeDiff(): AXTreeDiff {
  return { entries: [], added: 0, removed: 0, changed: 0, focusChanged: false, liveRegionsAdded: [] };
}

function treeContains(tree: AXNode[], pattern: RegExp): boolean {
  return tree.some((node) => pattern.test(`${node.role ?? ""} ${node.name ?? ""}`));
}

function goalProgressOf(evaluation: TransitionEvaluation): string | undefined {
  for (const [key, judgment] of Object.entries(evaluation.judgments)) {
    const question = judgment.question ?? key;
    if (!question.includes("goal_progress") && !key.includes("goal_progress")) continue;
    if (typeof judgment.value === "string") return judgment.value.toLowerCase();
    if (typeof judgment.value === "boolean") return judgment.value ? "done" : "continue";
  }
  return undefined;
}

function deriveStepResult(evaluation: TransitionEvaluation): StepResult {
  // Page-level observations (ambiguous names, weak associations) are surfaced
  // in the report and can trigger manual review, but they do not by themselves
  // make the transition itself a failure. Low-confidence judgments are also
  // held back: an impact needs calibrated evidence before it changes a result.
  const impacts = evaluation.findings
    .filter((finding) => !finding.observation)
    .filter((finding) => finding.confidence >= MIN_IMPACT_CONFIDENCE[finding.impact])
    .map((finding) => finding.impact);
  if (impacts.includes("blocking")) return "BLOCKED";
  if (impacts.includes("serious")) return "SERIOUS";
  if (impacts.includes("friction")) return "FRICTION";
  if (goalProgressOf(evaluation) === "uncertain") return "UNCERTAIN";
  return "PASS";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function candidateRelatesToGoal(candidate: CandidateAction, keywords: string[]): boolean {
  const name = candidate.accessibleName.toLowerCase();
  return keywords.some((keyword) => {
    if (!keyword) return false;
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(name);
  });
}

function isLargeVisualChange(mutations: MutationSummary[]): boolean {
  if (mutations.length > 12) return true;
  return mutations.some((mutation) => {
    if (mutation.type !== "element_added") return false;
    const haystack = [
      mutation.tag,
      mutation.text,
      mutation.attributes?.class,
      mutation.attributes?.role,
    ]
      .filter(Boolean)
      .join(" ");
    return MODAL_LIKE_PATTERN.test(haystack);
  });
}

function fallbackEvaluation(step: number, reason: string): TransitionEvaluation {
  return {
    step,
    provider: "mock",
    judgments: {},
    confidence: 0,
    findings: [
      {
        id: `finding-${step}-1`,
        step,
        title: "Semantic model unavailable — fallback analysis used",
        category: "semantics",
        impact: "friction",
        confidence: 0,
        evidence: [reason],
        recommendation:
          "Re-run the journey once the semantic judge is reachable; this step was not semantically verified.",
      },
    ],
    requiresManualReview: true,
    summary: "Semantic model unavailable — fallback analysis used.",
    fallbackUsed: true,
    fallbackReason: reason,
  };
}

function blockedEvaluation(step: number, reason: string): TransitionEvaluation {
  return {
    step,
    provider: "mock",
    judgments: {},
    confidence: 0,
    findings: [
      {
        id: `finding-${step}-1`,
        step,
        title: "Action could not be executed",
        category: "navigation",
        impact: "blocking",
        confidence: 0,
        evidence: [reason],
        recommendation:
          "Inspect the target control; it may be hidden, unstable, or unsupported by role/name locators.",
      },
    ],
    requiresManualReview: true,
    summary: `Action failed: ${reason}`,
  };
}

function buildSyntheticStep(
  step: number,
  goal: string,
  title: string,
  action: SemanticAction,
  evaluation: TransitionEvaluation,
  tree: AXNode[],
  focus: FocusSnapshot | null,
  url: string,
): JourneyStep {
  return {
    step,
    title,
    result: "UNCERTAIN",
    action,
    visualChange: "No action was executed.",
    semanticChange: evaluation.summary,
    evaluation,
    transition: {
      step,
      goal,
      action,
      before: { axTree: tree, focus },
      after: { axTree: tree, focus },
      treeDiff: emptyTreeDiff(),
      mutations: [],
    },
    urlBefore: url,
    urlAfter: url,
    durationMs: 0,
  };
}

export async function runJourney(options: RunJourneyOptions): Promise<JourneyReport> {
  const { url, goal, mode } = options;
  const maxActions = options.maxActions ?? JOURNEY_LIMITS.maxActions;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const steps: JourneyStep[] = [];
  const axeFindings: AxeFinding[] = [];
  const history: string[] = [];

  let status: JourneyStatus | undefined;
  let error: string | undefined;
  let goalReached = false;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;
  let session: BrowserSession | undefined;

  const emit = (event: JourneyEvent): void => {
    try {
      options.onEvent?.(event);
    } catch {
      // A broken listener must never abort the journey.
    }
  };

  try {
    emit({ type: "status", phase: "launch", message: "Launching Chromium" });
    session = await launchBrowser();
    const { page } = session;
    options.onPage?.(page);

    const judge = options.judge ?? createJudge();
    const providerStatus = judgeStatus();
    fallbackUsed = judge.kind === "mock" && !providerStatus.intentional;
    fallbackReason = fallbackUsed ? providerStatus.reason : undefined;

    await installMutationObserver(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: JOURNEY_LIMITS.navTimeoutMs });
    await waitForStability(page);

    const initial = await captureSnapshot(page);
    const initialAxe = await runAxe(page);
    axeFindings.push(...initialAxe.findings);
    emit({ type: "status", phase: "capture", message: "Captured initial accessibility state" });

    let currentTree = initial.tree;
    let currentFocus = initial.focus;
    let currentUrl = page.url();
    let currentAxe: AxeSummary = initialAxe;

    for (let step = 1; step <= maxActions; step += 1) {
      const evidence = treeEvidence(currentTree);
      const candidates = buildCandidates(currentTree, { limit: 12 });

      if (candidates.length === 0) {
        const evaluation: TransitionEvaluation = {
          step,
          provider: "mock",
          judgments: {},
          confidence: 1,
          findings: [
            {
              id: `finding-${step}-1`,
              step,
              title: "No accessible actions found",
              category: "navigation",
              impact: "blocking",
              confidence: 1,
              evidence: [
                `No interactive controls with an accessible role and name were present at step ${step}`,
                `URL: ${currentUrl}`,
              ],
              recommendation:
                "Check that the page exposes interactive controls to the accessibility tree, or confirm the journey already reached its goal.",
            },
          ],
          requiresManualReview: true,
          summary: "No accessible actions found.",
        };
        const blockedStep = buildSyntheticStep(
          step,
          goal,
          "No accessible actions found",
          { type: "navigate" },
          evaluation,
          currentTree,
          currentFocus,
          currentUrl,
        );
        blockedStep.result = "BLOCKED";
        steps.push(blockedStep);
        history.push(`${step}. No accessible actions found → BLOCKED`);
        emit({ type: "step", step: blockedStep });
        status = "blocked";
        error = "No accessible actions found";
        emit({ type: "status", phase: "blocked", message: "No accessible actions found", step });
        break;
      }

      // Select the next accessible action. When the judge cannot select, use the
      // first candidate (deterministic fallback) rather than stalling.
      let selection: ActionSelection;
      const firstCandidate = candidates[0];
      if (judge.selectNextAction) {
        try {
          selection = await withTimeout(
            judge.selectNextAction({
              step,
              goal,
              mode,
              candidates,
              history,
              focused: currentFocus ? describeFocus(currentFocus) : undefined,
              stateSummary: evidence.lines.slice(0, 30),
              url: currentUrl,
            }),
            25_000,
            "action selection",
          );
        } catch (selectionError) {
          const reason = messageOf(selectionError);
          emit({
            type: "status",
            phase: "select",
            message: `Action selection failed (${reason}); using first accessible action`,
            step,
          });
          selection = {
            candidateId: firstCandidate.id,
            confidence: 1,
            provider: "mock",
            rationale: `Fallback after selection error: ${reason}`,
            fallbackUsed: true,
          };
        }
      } else {
        selection = {
          candidateId: firstCandidate.id,
          confidence: 1,
          provider: "mock",
          rationale: "No action selector available; using first accessible action",
          fallbackUsed: true,
        };
      }

      if (selection.candidateId === "done") {
        goalReached = true;
        emit({ type: "status", phase: "goal", message: "Judge reported the goal complete", step });
        break;
      }
      if (selection.candidateId === "blocked") {
        const keywords = extractGoalKeywords(goal);
        const goalCandidate = candidates.find((entry) => candidateRelatesToGoal(entry, keywords));
        const disagreement = goalCandidate !== undefined;
        const finding: SemanticFinding = {
          id: `finding-${step}-1`,
          step,
          title: disagreement
            ? "Judge reported blocked while goal-related controls were offered"
            : "Journey reported blocked",
          category: "navigation",
          impact: "friction",
          confidence: selection.confidence,
          evidence: [
            `Judge selected "blocked" at step ${step}`,
            `${candidates.length} accessible action(s) were offered: ${candidates
              .slice(0, 4)
              .map(describeCandidate)
              .join("; ")}`,
            disagreement
              ? `Goal-related control available: ${describeCandidate(goalCandidate)}`
              : "No offered control matched the goal keywords",
          ],
          recommendation: disagreement
            ? "Review the offered action space: the judge and the available controls disagree about whether the journey can continue."
            : "Review the current state manually; the judge found no accessible path forward.",
          question: "action_selection",
        };
        const evaluation: TransitionEvaluation = {
          step,
          provider: "mock",
          judgments: {},
          confidence: selection.confidence,
          findings: [finding],
          requiresManualReview: true,
          summary: finding.title,
        };
        const blockedStep = buildSyntheticStep(
          step,
          goal,
          finding.title,
          { type: "navigate" },
          evaluation,
          currentTree,
          currentFocus,
          currentUrl,
        );
        blockedStep.result = disagreement ? "UNCERTAIN" : "BLOCKED";
        steps.push(blockedStep);
        history.push(`${step}. ${finding.title} → ${blockedStep.result}`);
        emit({ type: "step", step: blockedStep });
        emit({
          type: "status",
          phase: disagreement ? "review" : "blocked",
          message: finding.title,
          step,
        });
        status = disagreement ? "uncertain" : "blocked";
        break;
      }

      const candidate = candidates.find((entry) => entry.id === selection.candidateId);
      // Calibrated stop threshold: below this the judge's choice is not
      // trustworthy enough to execute autonomously (see README safety limits).
      if (selection.confidence < 0.4 || !candidate) {
        const chosen = candidate ?? firstCandidate;
        const evidenceLines = [
          `Jev could not confidently choose among ${candidates.length} accessible actions`,
          candidate
            ? `Selected candidate: ${describeCandidate(chosen)}`
            : `Selected candidate id "${selection.candidateId}" was not in the candidate list`,
        ];
        if (selection.rationale) evidenceLines.push(`Rationale: ${selection.rationale}`);
        const finding: SemanticFinding = {
          id: `finding-${step}-1`,
          step,
          title: "Low-confidence action selection",
          category: "navigation",
          impact: "friction",
          confidence: selection.confidence,
          evidence: evidenceLines,
          recommendation:
            "Review this step manually; the accessible action space may be ambiguous.",
          question: "action_selection",
        };
        const evaluation: TransitionEvaluation = {
          step,
          provider: "mock",
          judgments: {},
          confidence: selection.confidence,
          findings: [finding],
          requiresManualReview: true,
          summary:
            "Stopped because the action selection was not confident enough to execute autonomously.",
        };
        const reviewStep = buildSyntheticStep(
          step,
          goal,
          "Low-confidence action selection",
          describeAction(chosen),
          evaluation,
          currentTree,
          currentFocus,
          currentUrl,
        );
        steps.push(reviewStep);
        history.push(`${step}. ${describeCandidate(chosen)} → UNCERTAIN — Low-confidence action selection`);
        emit({ type: "step", step: reviewStep });
        status = "uncertain";
        emit({
          type: "status",
          phase: "review",
          message: "Low-confidence action selection — stopping for manual review",
          step,
        });
        break;
      }

      const action = describeAction(candidate);
      emit({
        type: "status",
        phase: "act",
        message: `Executing ${describeCandidate(candidate)}`,
        step,
      });
      const beforeRaw = await captureAXTree(page);
      const beforeTree = normalizeAXTree(beforeRaw);
      const domBefore = await captureFocus(page).catch(() => null);
      const beforeFocus = mergeFocus(domBefore, focusFromAXTree(beforeTree));
      const beforeShot = await captureScreenshot(page);
      await readMutations(page); // discard mutations buffered before this step
      const urlBefore = page.url();
      const actionStartedAt = Date.now();

      let actionError: string | undefined;
      try {
        await withTimeout(
          executeCandidate(page, candidate),
          JOURNEY_LIMITS.stepTimeoutMs,
          `action ${candidate.id} (${describeCandidate(candidate)})`,
        );
      } catch (executeError) {
        actionError = messageOf(executeError);
      }

      if (actionError) {
        const evaluation = blockedEvaluation(step, actionError);
        let afterTree = beforeTree;
        let afterFocus = beforeFocus;
        let afterShot: string | undefined;
        let mutations: MutationSummary[] = [];
        try {
          await waitForStability(page);
          const failedSnapshot = await captureSnapshot(page);
          afterTree = failedSnapshot.tree;
          afterFocus = failedSnapshot.focus;
          afterShot = failedSnapshot.screenshot;
          mutations = await readMutations(page);
        } catch {
          // Page may be gone; keep the before state.
        }
        const blockedStep: JourneyStep = {
          step,
          title: titleFromName(candidate.accessibleName),
          result: "BLOCKED",
          action,
          visualChange: describeVisualChange(mutations, urlBefore !== page.url()),
          semanticChange: evaluation.summary,
          evaluation,
          transition: {
            step,
            goal,
            action,
            before: { axTree: beforeTree, focus: beforeFocus },
            after: { axTree: afterTree, focus: afterFocus },
            treeDiff: diffAXTrees(beforeTree, afterTree),
            mutations,
            axeBefore: currentAxe,
          },
          screenshotBefore: beforeShot,
          screenshotAfter: afterShot,
          urlBefore,
          urlAfter: page.url(),
          durationMs: Date.now() - actionStartedAt,
        };
        steps.push(blockedStep);
        history.push(
          `${step}. ${describeCandidate(candidate)} → BLOCKED${evaluation.findings[0]?.title ? ` — ${evaluation.findings[0].title}` : ""}`,
        );
        emit({ type: "step", step: blockedStep });
        emit({ type: "status", phase: "blocked", message: `Action failed: ${actionError}`, step });
        break;
      }

      await waitForStability(page);
      const afterRaw = await captureAXTree(page);
      const afterTree = normalizeAXTree(afterRaw);
      const domAfter = await captureFocus(page).catch(() => null);
      const afterFocus = mergeFocus(domAfter, focusFromAXTree(afterTree));
      const mutations = await readMutations(page);
      const afterShot = await captureScreenshot(page);
      const urlAfter = page.url();
      const diff = diffAXTrees(beforeTree, afterTree);

      let evaluation: TransitionEvaluation;
      try {
        const evidenceInput = buildTransitionEvidence({
          step,
          goal,
          mode,
          action,
          beforeTree,
          afterTree,
          mutations,
          focusBefore: beforeFocus,
          focusAfter: afterFocus,
          diff,
          urlBefore,
          urlAfter,
          history,
        });
        evaluation = await withTimeout(
          judge.evaluateTransition(evidenceInput),
          30_000,
          "transition evaluation",
        );
      } catch (evaluationError) {
        const reason = messageOf(evaluationError);
        fallbackUsed = true;
        fallbackReason = fallbackReason ?? reason;
        evaluation = fallbackEvaluation(step, reason);
        emit({
          type: "status",
          phase: "evaluate",
          message: "Semantic model unavailable — fallback analysis used",
          step,
        });
      }

      let result = deriveStepResult(evaluation);
      // Reaching the goal is not the same as reaching it understandably: when
      // the final transition itself asks for human review, surface that.
      const actionIsCheckout = /checkout/i.test(candidate.accessibleName);
      if (result === "PASS" && actionIsCheckout && evaluation.requiresManualReview) {
        result = "UNCERTAIN";
      }

      const isLastAllowedStep = step === maxActions;
      let axeAfter: AxeSummary | undefined;
      if (isLargeVisualChange(mutations) || isLastAllowedStep) {
        try {
          const capturedAxe = await runAxe(page);
          axeAfter = capturedAxe;
          axeFindings.push(...capturedAxe.findings);
        } catch {
          axeAfter = undefined;
        }
      }

      const transition: SemanticTransition = {
        step,
        goal,
        action,
        before: { axTree: beforeTree, focus: beforeFocus },
        after: { axTree: afterTree, focus: afterFocus },
        treeDiff: diff,
        mutations,
        axeBefore: currentAxe,
        axeAfter,
      };

      const journeyStep: JourneyStep = {
        step,
        title: titleFromName(candidate.accessibleName),
        result,
        action,
        visualChange: describeVisualChange(mutations, urlBefore !== urlAfter),
        semanticChange: evaluation.summary,
        evaluation,
        transition,
        screenshotBefore: beforeShot,
        screenshotAfter: afterShot,
        urlBefore,
        urlAfter,
        durationMs: Date.now() - actionStartedAt,
      };

      if (axeAfter) currentAxe = axeAfter;
      currentTree = afterTree;
      currentFocus = afterFocus;
      currentUrl = urlAfter;

      steps.push(journeyStep);
      const outcome = [
        journeyStep.visualChange,
        evaluation.findings.find((finding) => !finding.observation)?.title,
      ]
        .filter(Boolean)
        .join("; ");
      history.push(
        `${step}. ${describeCandidate(candidate)} → ${result}${outcome ? ` — ${outcome}` : ""}`,
      );
      emit({ type: "step", step: journeyStep });

      // Goal completion: (a) judge says done, (b) a checkout-ish action was
      // executed (the goal's checkpoint), or (c) the judge says continue but no
      // remaining accessible action relates to the goal after step 4.
      const progress = goalProgressOf(evaluation);
      const afterHasCheckout = treeContains(afterTree, /checkout/i);
      if (progress === "done") {
        goalReached = true;
        emit({ type: "status", phase: "goal", message: "Judge reported the goal complete", step });
        break;
      }
      if (actionIsCheckout) {
        goalReached = true;
        emit({
          type: "status",
          phase: "goal",
          message: afterHasCheckout ? "Checkout state reached" : "Checkout action executed",
          step,
        });
        break;
      }
      if (progress === "continue" && step >= 4) {
        const keywords = extractGoalKeywords(goal);
        const nextCandidates = buildCandidates(afterTree, { limit: 12 });
        if (!nextCandidates.some((entry) => candidateRelatesToGoal(entry, keywords))) {
          emit({
            type: "status",
            phase: "goal",
            message: "No further goal-related accessible actions remain",
            step,
          });
          break;
        }
      }
    }
  } catch (fatal) {
    error = messageOf(fatal);
    status = "error";
    emit({ type: "error", message: error });
  } finally {
    options.onPage?.(null);
    if (session) await closeBrowser(session);
  }

  // Running out of actions without reaching the goal is not a completed
  // journey; surface it for review rather than reporting success.
  if (!status && !goalReached && steps.length > 0) {
    status = "uncertain";
  }

  const report = buildReport({
    url,
    goal,
    mode,
    steps,
    axeFindings,
    startedAt,
    durationMs: Date.now() - startedMs,
    status,
    error,
    fallbackUsed: fallbackUsed || undefined,
    fallbackReason,
  });
  emit({ type: "done", reportId: report.id });
  return report;
}
