import type { AxeFinding } from "./accessibility";
import type { JourneyMode, JourneyStep } from "./journey";

export type JourneyStatus =
  | "complete"
  | "complete_with_friction"
  | "blocked"
  | "uncertain"
  | "error";

export type SemanticFinding = {
  id: string;
  step: number;
  title: string;
  category: "feedback" | "focus" | "context" | "semantics" | "navigation";
  impact: "friction" | "serious" | "blocking";
  /** Probability reported by Jev (0..1). Never a WCAG certainty. */
  confidence: number;
  evidence: string[];
  recommendation: string;
  /** Which Jev question produced this finding. */
  question?: string;
  /**
   * Page-level observation that does not by itself change the step result.
   * Observations still appear in the report and can trigger manual review.
   */
  observation?: boolean;
};

export type JourneyReport = {
  id: string;

  target: {
    url: string;
    goal: string;
    mode: JourneyMode;
  };

  startedAt: string;
  durationMs: number;

  status: JourneyStatus;

  steps: JourneyStep[];

  semanticFindings: SemanticFinding[];

  axeFindings: AxeFinding[];

  requiresManualReview: boolean;

  /** Set when the live semantic model was unavailable and deterministic fallback was used. */
  fallbackUsed?: boolean;
  fallbackReason?: string;

  /** Human readable summary lines rendered by the dashboard. */
  summary: string[];

  error?: string;
};

export type JourneySummaryRow = {
  id: string;
  url: string;
  goal: string;
  mode: JourneyMode;
  status: JourneyStatus;
  startedAt: string;
  durationMs: number;
  stepCount: number;
  semanticFindingCount: number;
  axeFindingCount: number;
  requiresManualReview: boolean;
};
