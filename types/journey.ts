import type {
  AXNode,
  AXTreeDiff,
  AxeSummary,
  FocusSnapshot,
  MutationSummary,
} from "./accessibility";
import type { JourneyReport } from "./analysis";
import type { TransitionEvaluation } from "@/lib/jev/types";

export type JourneyMode = "broken" | "fixed" | "external";

export type CandidateAction = {
  id: string;
  action: "click" | "focus" | "check" | "select";
  role: string;
  accessibleName: string;
  /** 0-based occurrence among identical role+name pairs. */
  occurrence: number;
  /** True when the control looks destructive and must never be executed. */
  destructive?: boolean;
  disabled?: boolean;
};

export type SemanticAction = {
  type: "click" | "type" | "select" | "focus" | "navigate";
  role?: string;
  accessibleName?: string;
  value?: string;
};

export type SemanticTransition = {
  step: number;
  goal: string;
  action: SemanticAction;
  before: {
    axTree: AXNode[];
    focus: FocusSnapshot | null;
  };
  after: {
    axTree: AXNode[];
    focus: FocusSnapshot | null;
  };
  treeDiff: AXTreeDiff;
  mutations: MutationSummary[];
  axeBefore?: AxeSummary;
  axeAfter?: AxeSummary;
};

export type StepResult = "PASS" | "FRICTION" | "SERIOUS" | "BLOCKED" | "UNCERTAIN";

export type JourneyStep = {
  step: number;
  title: string;
  result: StepResult;
  action: SemanticAction;
  /** Visual description of what changed (derived from mutations + diff). */
  visualChange: string;
  semanticChange: string;
  evaluation: TransitionEvaluation;
  transition: SemanticTransition;
  screenshotBefore?: string;
  screenshotAfter?: string;
  urlBefore: string;
  urlAfter: string;
  durationMs: number;
};

export type JourneyEvent =
  | { type: "status"; phase: string; message: string; step?: number }
  | { type: "step"; step: JourneyStep }
  | { type: "done"; reportId: string }
  | { type: "error"; message: string };

export type JourneyRunState = {
  id: string;
  status: "queued" | "running" | "complete" | "error";
  phase: string;
  message: string;
  goal: string;
  url: string;
  steps: JourneyStep[];
  error?: string;
  reportId?: string;
  /** Present once the run completes (kept in memory for immediate rendering). */
  report?: JourneyReport;
  startedAt: string;
};
