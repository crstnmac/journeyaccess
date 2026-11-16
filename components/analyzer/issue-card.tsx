import { Lightbulb, Search } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SemanticFinding } from "@/types/analysis";

import { ConfidenceMeter, ImpactBadge } from "./shared";

const CATEGORY_LABEL: Record<SemanticFinding["category"], string> = {
  feedback: "Feedback",
  focus: "Focus",
  context: "Context",
  semantics: "Semantics",
  navigation: "Navigation",
};

export function IssueCard({ finding }: { finding: SemanticFinding }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <ImpactBadge impact={finding.impact} />
          <Badge variant="muted">{CATEGORY_LABEL[finding.category]}</Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            step {finding.step}
          </Badge>
        </div>
        <h3 className="text-sm font-semibold leading-snug">{finding.title}</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Search className="size-3.5" />
            Evidence
          </div>
          <ul className="space-y-1 text-xs text-foreground/90">
            {finding.evidence.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <ConfidenceMeter value={finding.confidence} />

        {finding.question ? (
          <div className="rounded-md bg-muted/60 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {finding.question} ={" "}
            <span className="text-foreground">
              {finding.category === "feedback" ? "false" : "flagged"}
            </span>
          </div>
        ) : null}

        <div className="rounded-md border border-dashed px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lightbulb className="size-3.5" />
            Suggested review
          </div>
          <p className="text-xs text-foreground/90">{finding.recommendation}</p>
        </div>
      </CardContent>
    </Card>
  );
}
