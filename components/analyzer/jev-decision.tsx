import { Badge } from "@/components/ui/badge";
import type { Judgment, TransitionEvaluation } from "@/lib/jev/types";

import { ConfidenceMeter } from "./shared";

function judgmentValueLabel(judgment: Judgment): string {
  if (judgment.type === "noul") return judgment.value ? "true" : "false";
  if (judgment.type === "score") return `${judgment.value} — ${judgment.label}`;
  return String(judgment.value);
}

function toneFor(judgment: Judgment): string {
  const value = judgmentValueLabel(judgment);
  if (judgment.type === "noul") return judgment.value ? "text-pass" : "text-serious";
  if (judgment.type === "score") return judgment.value >= 3 ? "text-pass" : judgment.value === 2 ? "text-friction" : "text-serious";
  if (/^(appropriate|continue|none|clear)/i.test(value)) return "text-pass";
  if (/^(broken|blocked|serious|insufficient)/i.test(value)) return "text-serious";
  return "text-friction";
}

export function JevDecision({ evaluation }: { evaluation: TransitionEvaluation }) {
  const judgments = Object.values(evaluation.judgments);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={evaluation.provider === "live" ? "info" : "muted"}>
          {evaluation.provider === "live" ? "Jev live model" : "Deterministic fallback"}
        </Badge>
        {evaluation.fallbackUsed ? (
          <Badge variant="friction">Semantic model unavailable — fallback analysis used</Badge>
        ) : null}
        {evaluation.requiresManualReview ? (
          <Badge variant="friction">Manual review recommended</Badge>
        ) : null}
      </div>

      <p className="text-sm text-foreground/90">{evaluation.summary}</p>

      {judgments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No structured judgments were produced for this step.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Question</th>
                <th className="px-3 py-2 font-medium">Judgment</th>
                <th className="px-3 py-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {judgments.map((judgment) => (
                <tr key={judgment.question} className="border-t">
                  <td className="px-3 py-2 font-mono text-[11px]">{judgment.question}</td>
                  <td className={`px-3 py-2 font-medium ${toneFor(judgment)}`}>
                    {judgmentValueLabel(judgment)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {Math.round(judgment.confidence * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfidenceMeter value={evaluation.confidence} />

      <p className="text-[11px] text-muted-foreground">
        These are structured semantic judgments about a single transition, not WCAG results. They
        indicate where a non-visual user may lose information; expert review may still be required.
      </p>
    </div>
  );
}
