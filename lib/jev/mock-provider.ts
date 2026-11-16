import type {
  ActionSelection,
  ActionSelectionInput,
  ChoiceJudgment,
  Judgment,
  NoulJudgment,
  ScoreJudgment,
  SemanticJudge,
  TransitionEvaluation,
  TransitionEvaluationInput,
} from "./types";
import { deriveFindings } from "./live-provider";

function noul(
  question: string,
  value: boolean,
  confidence: number,
  probabilities?: Record<string, number>,
): NoulJudgment {
  return {
    question,
    type: "noul",
    value,
    confidence,
    probabilities: probabilities ?? { true: value ? confidence : 1 - confidence, false: value ? 1 - confidence : confidence },
    provider: "mock",
  };
}

function choice(
  question: string,
  value: string,
  confidence: number,
  probabilities?: Record<string, number>,
): ChoiceJudgment {
  return {
    question,
    type: "choice",
    value,
    confidence,
    probabilities: probabilities ?? { [value]: confidence },
    provider: "mock",
  };
}

function score(question: string, value: number, label: string, confidence: number): ScoreJudgment {
  return {
    question,
    type: "score",
    value,
    label,
    confidence,
    probabilities: { [label]: confidence },
    provider: "mock",
  };
}

const SERIOUS_HISTORY_PATTERN = /SERIOUS|no dialog|without dialog semantics/i;

function summarize(findings: { title: string; impact: string }[]): string {
  if (findings.length === 0) {
    return "Action completed and the resulting state was exposed through accessible semantics.";
  }
  const primary = findings[0];
  if (primary.impact === "serious" || primary.impact === "blocking") {
    return `${primary.title}. The accessibility state does not adequately reflect the visual change.`;
  }
  return `${primary.title}. The journey can likely continue but the semantic feedback is weaker than the visual feedback.`;
}

export class MockJevProvider implements SemanticJudge {
  readonly name = "jev-mock";
  readonly kind = "mock" as const;

  async evaluateTransition(input: TransitionEvaluationInput): Promise<TransitionEvaluation> {
    const { signals } = input;

    const feedbackMissing =
      signals.visibleConfirmationTexts.length > 0 && !signals.liveRegionAdded && !signals.statusRoleAdded;

    const dialogMissing = signals.modalLikeVisualChange && !signals.dialogRolePresent;

    const focusBroken = signals.modalLikeVisualChange && signals.focusStayedOnTrigger && !signals.dialogRoleAdded;
    const focusQuestionable =
      !focusBroken &&
      signals.focusChanged &&
      signals.modalLikeVisualChange &&
      (input.focus.after === undefined || /body|generic/i.test(input.focus.after ?? ""));

    const historyHasSerious = input.history.some((line) => SERIOUS_HISTORY_PATTERN.test(line));
    const goalBlocked = signals.newInteractiveCount === 0 && signals.removedInteractiveCount > 0;
    const goalUncertain =
      !goalBlocked && ((dialogMissing && !signals.dialogRoleAdded) || historyHasSerious);

    const hasSemanticsFindings =
      signals.ambiguousControls.length > 0 || signals.weakAssociations.length > 0;

    const manualReview = hasSemanticsFindings || goalUncertain || focusBroken;

    const impact: "none" | "friction" | "serious" | "blocking" = goalBlocked
      ? "blocking"
      : dialogMissing || focusBroken
        ? "serious"
        : feedbackMissing || goalUncertain
          ? "friction"
          : "none";

    const contextScore = dialogMissing || feedbackMissing ? 1 : hasSemanticsFindings || goalUncertain ? 2 : 3;

    const judgments: Record<string, Judgment> = {
      feedback_exposed: noul("feedback_exposed", !feedbackMissing, feedbackMissing ? 0.96 : 0.9),
      focus_transition: focusBroken
        ? choice("focus_transition", "broken", 0.98, {
            appropriate: 0.01,
            questionable: 0.01,
            broken: 0.98,
          })
        : focusQuestionable
          ? choice("focus_transition", "questionable", 0.82, {
              appropriate: 0.12,
              questionable: 0.82,
              broken: 0.06,
            })
          : choice("focus_transition", "appropriate", 0.9, {
              appropriate: 0.9,
              questionable: 0.08,
              broken: 0.02,
            }),
      semantic_context: score(
        "semantic_context",
        contextScore,
        contextScore === 1
          ? "Insufficient semantic context"
          : contextScore === 2
            ? "Partially understandable"
            : "Clear semantic context",
        0.88,
      ),
      goal_progress: goalBlocked
        ? choice("goal_progress", "blocked", 0.9, { continue: 0.03, uncertain: 0.07, blocked: 0.9 })
        : goalUncertain
          ? choice("goal_progress", "uncertain", 0.9, { continue: 0.07, uncertain: 0.9, blocked: 0.03 })
          : choice("goal_progress", "continue", 0.9, { continue: 0.9, uncertain: 0.08, blocked: 0.02 }),
      manual_review: noul("manual_review", manualReview, 0.8),
      impact: choice("impact", impact, impact === "serious" ? 0.98 : impact === "friction" ? 0.92 : 0.9),
    };

    const findings = deriveFindings(judgments, input);
    const drivingConfidences = findings.map((finding) => finding.confidence);
    const confidence = drivingConfidences.length
      ? Math.min(...drivingConfidences)
      : judgments.impact.confidence;

    return {
      step: input.step,
      provider: "mock",
      judgments,
      confidence: Number(confidence.toFixed(4)),
      findings,
      requiresManualReview: manualReview,
      summary: summarize(findings),
      raw: { signals, judgments },
    };
  }

  async selectNextAction(input: ActionSelectionInput): Promise<ActionSelection> {
    if (input.candidates.length === 0) {
      return {
        candidateId: "blocked",
        confidence: 0.95,
        provider: "mock",
        rationale: "No accessible actions were available.",
      };
    }

    if (input.history.some((line) => /checkout/i.test(line))) {
      return {
        candidateId: "done",
        confidence: 0.95,
        provider: "mock",
        rationale: "The checkout step already executed; the goal is complete.",
      };
    }

    const historyText = input.history.join(" | ").toLowerCase();
    const goalText = input.goal.toLowerCase();
    const find = (pattern: RegExp) => input.candidates.find((c) => pattern.test(c.accessibleName));

    const goalMentionsHeadphones = /wireless headphones/.test(goalText);
    const visitedHeadphones = /wireless headphones/.test(historyText);
    const addedToCart = /add to cart/.test(historyText);
    const openedCart = /open cart/.test(historyText);

    let selected = null as (typeof input.candidates)[number] | null;
    let rationale = "";
    let confidence = 0.95;

    if (goalMentionsHeadphones && !visitedHeadphones && !addedToCart && !openedCart) {
      selected = find(/wireless headphones/i) ?? null;
      rationale = "The goal names Wireless Headphones and that product has not been opened yet.";
    }
    if (!selected && !addedToCart && (visitedHeadphones || !goalMentionsHeadphones)) {
      selected = find(/add to cart/i) ?? null;
      rationale = "The product is open and has not been added to the cart yet.";
    }
    if (!selected && addedToCart && !openedCart) {
      selected = find(/open cart/i) ?? null;
      rationale = "The item is in the cart; opening the cart is the next step toward checkout.";
    }
    if (!selected && openedCart) {
      selected = find(/checkout/i) ?? null;
      rationale = "The cart is open; continuing to checkout completes the goal.";
    }
    if (!selected) {
      const keywords = input.goal
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter((word) => word.length > 3) ?? [];
      selected =
        input.candidates.find((candidate) =>
          keywords.some((keyword) => candidate.accessibleName.toLowerCase().includes(keyword)),
        ) ?? null;
      if (selected) {
        rationale = "Selected the candidate whose accessible name best overlaps with the goal.";
        confidence = 0.7;
      }
    }
    if (!selected) {
      selected = input.candidates[0];
      rationale = "No candidate clearly matched the goal; selected the first accessible action.";
      confidence = 0.55;
    }

    const probabilities: Record<string, number> = {};
    const others = input.candidates.filter((candidate) => candidate.id !== selected.id);
    probabilities[selected.id] = confidence;
    const remainder = Number(((1 - confidence) / Math.max(others.length, 1)).toFixed(4));
    for (const candidate of others) probabilities[candidate.id] = remainder;

    return {
      candidateId: selected.id,
      confidence,
      probabilities,
      rationale,
      provider: "mock",
    };
  }
}
