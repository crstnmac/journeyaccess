import type {
  ActionSelection,
  ActionSelectionInput,
  SemanticJudge,
  TransitionEvaluation,
  TransitionEvaluationInput,
} from "./types";
import { JevProviderError } from "./types";
import { LiveJevProvider } from "./live-provider";
import { MockJevProvider } from "./mock-provider";

export const JEV_FALLBACK_NOTICE = "Semantic model unavailable — fallback analysis used";

/**
 * Wraps the live provider so a transport/validation failure degrades to the
 * deterministic mock instead of fabricating model output. The fallback is
 * always labelled in the result (`fallbackUsed`, `fallbackReason`).
 */
export class FallbackJudge implements SemanticJudge {
  readonly name = "jev-fallback";
  readonly kind = "live" as const;

  private readonly primary: SemanticJudge;
  private readonly fallback: SemanticJudge;

  constructor(primary: SemanticJudge, fallback: SemanticJudge) {
    this.primary = primary;
    this.fallback = fallback;
  }

  private warn(reason: string): void {
    console.warn(`[semantic-journey] ${JEV_FALLBACK_NOTICE}: ${reason}`);
  }

  async evaluateTransition(input: TransitionEvaluationInput): Promise<TransitionEvaluation> {
    try {
      const result = await this.primary.evaluateTransition(input);
      return { ...result, provider: "live" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.warn(reason);
      const result = await this.fallback.evaluateTransition(input);
      return {
        ...result,
        provider: "mock",
        fallbackUsed: true,
        fallbackReason: reason,
      };
    }
  }

  async selectNextAction(input: ActionSelectionInput): Promise<ActionSelection> {
    if (!this.primary.selectNextAction) {
      if (!this.fallback.selectNextAction) {
        throw new JevProviderError("No action selector available");
      }
      return this.fallback.selectNextAction(input);
    }
    try {
      const result = await this.primary.selectNextAction(input);
      return { ...result, provider: "live" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.warn(reason);
      if (!this.fallback.selectNextAction) {
        throw error instanceof JevProviderError ? error : new JevProviderError(reason);
      }
      const result = await this.fallback.selectNextAction(input);
      return { ...result, provider: "mock", fallbackUsed: true };
    }
  }
}

function configuredMode(): "live" | "mock" {
  const raw = (process.env.JEV_MODE ?? "live").trim().toLowerCase();
  return raw === "mock" ? "mock" : "live";
}

function apiKey(): string {
  return (process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY ?? "").trim();
}

export function createJudge(mode?: "live" | "mock" | "auto"): SemanticJudge {
  const requested = mode && mode !== "auto" ? mode : configuredMode();
  if (requested === "live" && apiKey()) {
    return new FallbackJudge(new LiveJevProvider(), new MockJevProvider());
  }
  return new MockJevProvider();
}

export function judgeStatus(): {
  mode: "live" | "mock";
  reason?: string;
  model?: string;
  /** True when mock mode was explicitly configured rather than used as a fallback. */
  intentional: boolean;
} {
  const requested = configuredMode();
  const key = apiKey();
  if (requested === "live" && key) {
    return {
      mode: "live",
      model: process.env.JEV_MODEL ?? "jev-latest",
      intentional: false,
    };
  }
  if (requested === "live" && !key) {
    return {
      mode: "mock",
      reason: "JEV_API_KEY is not set; using the deterministic mock judge",
      intentional: false,
    };
  }
  return { mode: "mock", reason: "JEV_MODE=mock; using the deterministic mock judge", intentional: true };
}
