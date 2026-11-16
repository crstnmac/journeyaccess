import type { SemanticFinding } from "@/types/analysis";
import type {
  ActionSelection,
  ActionSelectionInput,
  Judgment,
  JeVQuestion,
  SemanticJudge,
  TransitionEvaluation,
  TransitionEvaluationInput,
} from "./types";
import { JevProviderError, MIN_IMPACT_CONFIDENCE } from "./types";
import {
  buildActionSelectionQuestion,
  buildEvidence,
  buildTransitionQuestions,
} from "./prompts";

const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const REQUEST_TIMEOUT_MS = 25_000;

type RawAnswer = {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

export type LiveProviderOptions = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateAnswer(question: JeVQuestion, answer: unknown): RawAnswer {
  const criteriaKeys = Object.keys(question.criteria);
  if (!isRecord(answer)) {
    throw new JevProviderError(`Missing answer for "${question.id}"`, { malformed: true });
  }
  const choice = answer.choice;
  const confidence = answer.confidence;
  const probabilities = answer.probabilities;
  if (typeof choice !== "string" || !criteriaKeys.includes(choice)) {
    throw new JevProviderError(`Answer for "${question.id}" chose an unknown criterion`, {
      malformed: true,
    });
  }
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new JevProviderError(`Answer for "${question.id}" has an invalid confidence`, {
      malformed: true,
    });
  }
  if (!isRecord(probabilities)) {
    throw new JevProviderError(`Answer for "${question.id}" is missing probabilities`, {
      malformed: true,
    });
  }
  const probabilityEntries = Object.entries(probabilities);
  if (
    probabilityEntries.length !== criteriaKeys.length ||
    !probabilityEntries.every(([key]) => criteriaKeys.includes(key))
  ) {
    throw new JevProviderError(`Answer for "${question.id}" probabilities do not match criteria`, {
      malformed: true,
    });
  }
  const numbers = probabilityEntries.map(([, value]) => value);
  if (
    !numbers.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
  ) {
    throw new JevProviderError(`Answer for "${question.id}" has invalid probability values`, {
      malformed: true,
    });
  }
  const sum = numbers.reduce((total: number, value) => total + (value as number), 0);
  if (Math.abs(sum - 1) >= 0.02) {
    throw new JevProviderError(`Answer for "${question.id}" probabilities do not sum to 1`, {
      malformed: true,
    });
  }
  const chosenProbability = probabilities[choice];
  const maxProbability = Math.max(...numbers.map((value) => value as number));
  if (
    typeof chosenProbability !== "number" ||
    chosenProbability < maxProbability - 1e-6
  ) {
    throw new JevProviderError(`Answer for "${question.id}" is inconsistent with its probabilities`, {
      malformed: true,
    });
  }
  return {
    choice,
    confidence,
    probabilities: Object.fromEntries(
      probabilityEntries.map(([key, value]) => [key, value as number]),
    ),
  };
}

function judgmentFromAnswer(
  question: JeVQuestion,
  answer: RawAnswer,
  provider: "live" | "mock",
): Judgment {
  const base = {
    question: question.id,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    provider,
  };
  if (question.type === "noul") {
    return { ...base, type: "noul", value: answer.choice === "true" };
  }
  if (question.type === "score") {
    const labels = Object.keys(question.criteria);
    const index = labels.indexOf(answer.choice);
    return { ...base, type: "score", value: index + 1, label: answer.choice };
  }
  return { ...base, type: "choice", value: answer.choice };
}

function judgmentValue(judgments: Record<string, Judgment>, id: string): unknown {
  const judgment = judgments[id];
  return judgment ? judgment.value : undefined;
}

function confidenceOf(judgments: Record<string, Judgment>, ids: string[]): number {
  const values = ids
    .map((id) => judgments[id]?.confidence)
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return 0;
  return Math.min(...values);
}

function feedbackEvidence(input: TransitionEvaluationInput): string[] {
  const evidence: string[] = [];
  const { signals } = input;
  if (signals.visibleConfirmationTexts.length > 0) {
    evidence.push(`Visible confirmation appeared: ${signals.visibleConfirmationTexts.join(", ")}`);
  }
  if (!signals.liveRegionAdded && !signals.statusRoleAdded) {
    evidence.push("No status or live-region semantics were added to the accessibility tree");
  }
  if (signals.focusStayedOnTrigger) {
    evidence.push("Focus did not move to the feedback");
  }
  if (input.domMutations.length > 0) {
    evidence.push("The DOM changed visibly");
  }
  if (input.semanticChanges.added.length > 0) {
    evidence.push(`Accessibility tree additions: ${input.semanticChanges.added.join(", ")}`);
  }
  return evidence.slice(0, 5);
}

function dialogEvidence(input: TransitionEvaluationInput): string[] {
  const evidence = ["A visually modal element was added to the DOM"];
  if (!input.signals.dialogRoleAdded) {
    evidence.push("No dialog or alertdialog role was exposed");
  }
  if (input.signals.focusStayedOnTrigger) {
    evidence.push(`Focus remained on ${input.focus.before ?? "the trigger"}`);
  }
  if (input.focus.after) {
    evidence.push(`Focus after the action: ${input.focus.after}`);
  }
  if (input.signals.newInteractiveCount > 0) {
    evidence.push(`${input.signals.newInteractiveCount} new interactive element(s) became reachable`);
  }
  return evidence.slice(0, 5);
}

export function deriveFindings(
  judgments: Record<string, Judgment>,
  input: TransitionEvaluationInput,
): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  const { signals } = input;
  const step = input.step;
  let counter = 0;
  const nextId = () => `finding-${step}-${(counter += 1)}`;

  const feedback = judgmentValue(judgments, "feedback_exposed");
  if (feedback === false) {
    findings.push({
      id: nextId(),
      step,
      title: "Potential unannounced action feedback",
      category: "feedback",
      impact: "friction",
      confidence: judgments.feedback_exposed?.confidence ?? 0.9,
      evidence: feedbackEvidence(input),
      recommendation:
        "Verify that this confirmation is announced by common screen-reader/browser combinations; expose it through a status or live region.",
      question: "feedback_exposed",
    });
  }

  const focusTransition = judgmentValue(judgments, "focus_transition");
  const dialogMissing = signals.modalLikeVisualChange && !signals.dialogRolePresent;

  if (focusTransition === "broken" && !dialogMissing) {
    findings.push({
      id: nextId(),
      step,
      title: "Focus transition breaks context",
      category: "focus",
      impact: "serious",
      confidence: judgments.focus_transition?.confidence ?? 0.9,
      evidence: [
        `Focus before: ${input.focus.before ?? "none"}`,
        `Focus after: ${input.focus.after ?? "none"}`,
        ...(signals.modalLikeVisualChange ? ["A new overlay or panel became visible"] : []),
      ],
      recommendation:
        "Move focus into the newly revealed context and restore it to the trigger when it closes.",
      question: "focus_transition",
    });
  } else if (focusTransition === "questionable") {
    findings.push({
      id: nextId(),
      step,
      title: "Focus transition may lose context",
      category: "focus",
      impact: "friction",
      confidence: judgments.focus_transition?.confidence ?? 0.82,
      evidence: [
        `Focus before: ${input.focus.before ?? "none"}`,
        `Focus after: ${input.focus.after ?? "none"}`,
      ],
      recommendation:
        "Verify that focus lands somewhere that preserves context for non-visual users.",
      question: "focus_transition",
    });
  }

  if (dialogMissing) {
    findings.push({
      id: nextId(),
      step,
      title: "Overlay appeared without dialog semantics",
      category: "context",
      impact: "serious",
      confidence: Math.max(
        judgments.semantic_context?.confidence ?? 0,
        judgments.focus_transition?.confidence ?? 0,
        0.9,
      ),
      evidence: dialogEvidence(input),
      recommendation:
        "Expose the overlay as a dialog with an accessible name, move focus into it, keep focus inside while it is open, and restore focus to the trigger on close.",
      question: "semantic_context",
    });
  }

  if (signals.ambiguousControls.length > 0) {
    findings.push({
      id: nextId(),
      step,
      title: "Ambiguous control purpose",
      category: "semantics",
      impact: "friction",
      confidence: Math.min(judgments.semantic_context?.confidence ?? 0.85, 0.85),
      evidence: [
        ...signals.ambiguousControls.map(
          (control) => `Control ${control} has no distinguishing accessible context`,
        ),
        "Its purpose depends on nearby visual information that is not part of its accessible name or description",
      ].slice(0, 4),
      recommendation:
        "Give the control a specific accessible name that describes what it acts on.",
      question: "semantic_context",
      observation: true,
    });
  }

  if (signals.weakAssociations.length > 0) {
    findings.push({
      id: nextId(),
      step,
      title: "Important context is not semantically associated",
      category: "semantics",
      impact: "friction",
      confidence: Math.min(judgments.semantic_context?.confidence ?? 0.8, 0.8),
      evidence: [
        ...signals.weakAssociations.map(
          (text) => `Text "${text}" is not referenced by any control's accessible description`,
        ),
        "The relationship exists visually but not in the accessibility tree",
      ].slice(0, 4),
      recommendation:
        "Associate the contextual text with the relevant control (for example with aria-describedby) so it is available without visual scanning.",
      question: "semantic_context",
      observation: true,
    });
  }

  const goalProgress = judgmentValue(judgments, "goal_progress");
  if (goalProgress === "uncertain" || goalProgress === "blocked") {
    findings.push({
      id: nextId(),
      step,
      title:
        goalProgress === "blocked"
          ? "Journey continuation is blocked"
          : "Journey continuation is uncertain",
      category: "navigation",
      impact: goalProgress === "blocked" ? "blocking" : "friction",
      confidence: judgments.goal_progress?.confidence ?? 0.9,
      evidence: [
        ...input.history.slice(-3).map((line) => `Earlier: ${line}`),
        `Focused after action: ${input.focus.after ?? "none"}`,
        signals.dialogRolePresent ? "Dialog semantics are present" : "No dialog semantics were present",
      ].slice(0, 5),
      recommendation:
        "Manually review whether a non-visual user could continue toward the goal from this state.",
      question: "goal_progress",
    });
  }

  const manualReview = judgmentValue(judgments, "manual_review");
  if (manualReview === true && findings.length === 0) {
    findings.push({
      id: nextId(),
      step,
      title: "Manual review recommended",
      category: "context",
      impact: "friction",
      confidence: judgments.manual_review?.confidence ?? 0.8,
      evidence: [
        "The structured judgments did not isolate a specific failure",
        "The available evidence is contextual and may need expert review",
      ],
      recommendation:
        "Have an accessibility specialist review this transition with real assistive technology.",
      question: "manual_review",
      observation: true,
    });
  }

  const severity: Record<SemanticFinding["impact"], number> = {
    blocking: 3,
    serious: 2,
    friction: 1,
  };
  return findings
    // Calibrated evidence floors: a "serious" finding at 0.22 probability is
    // the model hedging, not evidence. Raw judgments stay in the debug output.
    .filter((finding) => finding.confidence >= MIN_IMPACT_CONFIDENCE[finding.impact])
    .sort((a, b) => severity[b.impact] - severity[a.impact] || b.confidence - a.confidence)
    .map((finding, index) => ({
      ...finding,
      id: `finding-${step}-${index + 1}`,
      confidence: Number(finding.confidence.toFixed(4)),
    }));
}

function summarizeEvaluation(
  judgments: Record<string, Judgment>,
  findings: SemanticFinding[],
): string {
  const impact = judgmentValue(judgments, "impact");
  if (findings.length === 0) {
    return "Action completed and the resulting state was exposed through accessible semantics.";
  }
  const primary = findings[0].title;
  if (impact === "serious" || impact === "blocking") {
    return `${primary}. The accessibility state does not adequately reflect the visual change.`;
  }
  return `${primary}. The journey can likely continue but the semantic feedback is weaker than the visual feedback.`;
}

export class LiveJevProvider implements SemanticJudge {
  readonly name = "jev-live";
  readonly kind = "live" as const;

  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LiveProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY ?? "";
    if (!apiKey) {
      throw new JevProviderError("JEV_API_KEY is not configured");
    }
    this.apiKey = apiKey;
    this.endpoint = options.endpoint ?? process.env.JEV_ENDPOINT ?? DEFAULT_ENDPOINT;
    this.model = options.model ?? process.env.JEV_MODEL ?? DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.status === 429 || response.status === 529 || response.status === 503) {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
            continue;
          }
        }
        if (!response.ok) {
          throw new JevProviderError(`Jev request failed with HTTP ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (!isRecord(payload)) {
          throw new JevProviderError("Jev returned a non-object response", { malformed: true });
        }
        return payload;
      } catch (error) {
        lastError = error;
        if (error instanceof JevProviderError) throw error;
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new JevProviderError(
      `Jev request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  private async ask(
    questions: JeVQuestion[],
    state: Record<string, unknown>,
  ): Promise<Record<string, Judgment>> {
    const questionPayload: Record<string, unknown> = {};
    for (const question of questions) {
      questionPayload[question.id] = {
        type: "choice",
        criteria: question.criteria,
        instructions: question.instructions,
      };
    }
    const payload = await this.request({
      model: this.model,
      state,
      questions: questionPayload,
    });
    const answers = payload.answers;
    if (!isRecord(answers)) {
      throw new JevProviderError("Jev response is missing answers", { malformed: true });
    }
    const judgments: Record<string, Judgment> = {};
    for (const question of questions) {
      const raw = validateAnswer(question, answers[question.id]);
      judgments[question.id] = judgmentFromAnswer(question, raw, "live");
    }
    return judgments;
  }

  async evaluateTransition(input: TransitionEvaluationInput): Promise<TransitionEvaluation> {
    const questions = buildTransitionQuestions(input);
    const evidence = buildEvidence(input);
    const elements = input.nearbyAccessibilityState
      .map((line, index) => {
        const match = line.match(/^([a-z]+)\s+"([^"]*)"/i);
        if (!match) return null;
        return {
          index: String(index + 1),
          label: line,
          role: match[1],
          operations: ["CLICK"],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const judgments = await this.ask(questions, {
      page: {
        url: input.mode === "external" ? "external" : `semantic-journey://${input.mode}`,
        title: `Transition ${input.step}: ${input.action.accessibleName ?? input.action.type}`,
        text: JSON.stringify(evidence),
      },
      elements,
      recent_actions: input.history.map((line) => ({ action: "step", text: line, page_changed: false })),
    });

    const findings = deriveFindings(judgments, input);
    // Headline confidence: the first finding is the highest-severity one, so
    // its probability is the number the report should lead with. Raw
    // probabilities are preserved on every finding regardless.
    const confidence = findings.length
      ? findings[0].confidence
      : (judgments.impact?.confidence ??
        confidenceOf(judgments, ["semantic_context", "goal_progress"]));

    const goalProgress = judgmentValue(judgments, "goal_progress");
    const requiresManualReview =
      findings.length > 0 &&
      (judgmentValue(judgments, "manual_review") === true ||
        findings.some((finding) => finding.observation) ||
        goalProgress === "uncertain" ||
        goalProgress === "blocked");

    return {
      step: input.step,
      provider: "live",
      judgments,
      confidence,
      findings,
      requiresManualReview,
      summary: summarizeEvaluation(judgments, findings),
      raw: { request: { model: this.model, state: "compact-evidence" }, judgments },
    };
  }

  async selectNextAction(input: ActionSelectionInput): Promise<ActionSelection> {
    const question = buildActionSelectionQuestion(input);
    const state = {
      page: {
        url: input.url ?? `semantic-journey://${input.mode}`,
        title: `Step ${input.step} action selection`,
        text: JSON.stringify({
          goal: input.goal,
          step: input.step,
          mode: input.mode,
          url: input.url ?? null,
          focused: input.focused ?? null,
          recent_steps: input.history.slice(-8),
          page_state: input.stateSummary.slice(0, 40),
        }),
      },
      elements: input.candidates.map((candidate, index) => ({
        index: String(index + 1),
        label: `${candidate.action} ${candidate.role} "${candidate.accessibleName}"`,
        role: candidate.role,
        operations: [candidate.action === "click" ? "CLICK" : candidate.action.toUpperCase()],
      })),
      recent_actions: input.history.map((line) => ({ action: "step", text: line, page_changed: false })),
    };

    const judgments = await this.ask([question], state);
    const judgment = judgments.next_action;
    const choice = typeof judgment.value === "string" ? judgment.value : "blocked";
    let candidateId = choice;
    if (choice.startsWith("action_")) {
      const index = Number.parseInt(choice.slice("action_".length), 10) - 1;
      const candidate = input.candidates[index];
      if (!candidate) {
        throw new JevProviderError(`Jev selected an action outside the candidate list`, {
          malformed: true,
        });
      }
      candidateId = candidate.id;
    } else if (choice !== "done" && choice !== "blocked") {
      throw new JevProviderError(`Jev returned an unknown action selection "${choice}"`, {
        malformed: true,
      });
    }

    return {
      candidateId,
      confidence: judgment.confidence,
      probabilities: judgment.probabilities,
      rationale: `Jev selected "${choice}"`,
      provider: "live",
      raw: judgment,
    };
  }
}
