import type { SemanticFinding } from "@/types/analysis";
import type { CandidateAction, JourneyMode, SemanticAction } from "@/types/journey";

/**
 * Jev question kinds.
 *
 * - `noul`  → boolean judgment
 * - `choice`→ one of a fixed set of labels
 * - `score` → ordinal judgment (1..n)
 *
 * On the wire these are all expressed as TypeSafe `choice` questions; the
 * semantic difference is carried by the criteria map. See `lib/jev/prompts.ts`.
 */
export type JeVQuestionType = "noul" | "choice" | "score";

export type JeVCriteria = Record<string, string>;

export type JeVQuestion = {
  /** Question key, e.g. `feedback_exposed`. */
  id: string;
  type: JeVQuestionType;
  instructions: string;
  criteria: JeVCriteria;
};

export type JudgmentBase = {
  question: string;
  type: JeVQuestionType;
  confidence: number;
  /** Raw probabilities for each criterion label, when the provider returns them. */
  probabilities: Record<string, number>;
  /** Provider that produced this judgment. */
  provider: "live" | "mock";
};

export type NoulJudgment = JudgmentBase & { type: "noul"; value: boolean };
export type ChoiceJudgment = JudgmentBase & { type: "choice"; value: string };
export type ScoreJudgment = JudgmentBase & {
  type: "score";
  /** 1-based score. */
  value: number;
  label: string;
};

export type Judgment = NoulJudgment | ChoiceJudgment | ScoreJudgment;

/** Compact evidence handed to the semantic judge. Never the raw page. */
export type TransitionEvaluationInput = {
  step: number;
  goal: string;
  mode: JourneyMode;
  action: SemanticAction;

  focus: {
    before?: string;
    after?: string;
  };

  semanticChanges: {
    added: string[];
    removed: string[];
    changed: string[];
  };

  domMutations: string[];

  liveRegions: string[];

  /** Compact, human readable lines from the after-state tree. */
  nearbyAccessibilityState: string[];

  /** One-line summaries of before/after trees for context. */
  beforeSummary: string;
  afterSummary: string;

  /** Compact descriptions of earlier steps in this journey. */
  history: string[];

  /**
   * Deterministic, factual annotations about this transition that help the
   * judge interpret the raw evidence (for example: "full-page navigation").
   * These are derived from captured state, not from model output.
   */
  notes: string[];

  /** Structured signals used by the deterministic fallback judge. */
  signals: TransitionSignals;
};

/** Booleans derived from the captured browser state (not model output). */
export type TransitionSignals = {
  visibleConfirmationTexts: string[];
  liveRegionAdded: boolean;
  statusRoleAdded: boolean;
  focusChanged: boolean;
  focusStayedOnTrigger: boolean;
  dialogRolePresent: boolean;
  dialogRoleAdded: boolean;
  focusInsideDialog: boolean;
  modalLikeVisualChange: boolean;
  largeVisualChange: boolean;
  newInteractiveCount: number;
  removedInteractiveCount: number;
  ambiguousControls: string[];
  weakAssociations: string[];
  urlChanged: boolean;
  cartCountChanged: string[];
  goalKeywordsPresent: string[];
  /** Interactive controls whose accessible name matches the goal. */
  goalControlsVisible: string[];
};

export type TransitionEvaluation = {
  step: number;
  provider: "live" | "mock";
  judgments: Record<string, Judgment>;
  /** Aggregate confidence across the judgments that produced findings. */
  confidence: number;
  /** Findings derived from the judgments. */
  findings: SemanticFinding[];
  requiresManualReview: boolean;
  /** Short human readable explanation of the outcome. */
  summary: string;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  /** Raw provider payload for the developer debug panel. */
  raw?: unknown;
};

export type ActionSelectionInput = {
  step: number;
  goal: string;
  mode: JourneyMode;
  candidates: CandidateAction[];
  /** Compact descriptions of the last few executed actions. */
  history: string[];
  /** Compact line for the current focused node. */
  focused?: string;
  /** Compact lines describing the current state. */
  stateSummary: string[];
  /** Current page URL, for context about where the journey is. */
  url?: string;
};

export type ActionSelection = {
  /** Candidate id, or the reserved values `done` / `blocked`. */
  candidateId: string;
  confidence: number;
  probabilities?: Record<string, number>;
  rationale?: string;
  provider: "live" | "mock";
  fallbackUsed?: boolean;
  raw?: unknown;
};

export interface SemanticJudge {
  readonly name: string;
  readonly kind: "live" | "mock";

  evaluateTransition(input: TransitionEvaluationInput): Promise<TransitionEvaluation>;

  selectNextAction?(input: ActionSelectionInput): Promise<ActionSelection>;
}

/**
 * Minimum probability required before a finding's impact is treated as
 * evidence. Below these floors the model is hedging; the raw judgment is still
 * preserved in the developer evidence panel.
 */
export const MIN_IMPACT_CONFIDENCE: Record<"blocking" | "serious" | "friction", number> = {
  blocking: 0.6,
  serious: 0.4,
  friction: 0.25,
};

export class JevProviderError extends Error {
  readonly malformed: boolean;
  constructor(message: string, options?: { malformed?: boolean }) {
    super(message);
    this.name = "JevProviderError";
    this.malformed = options?.malformed ?? false;
  }
}
