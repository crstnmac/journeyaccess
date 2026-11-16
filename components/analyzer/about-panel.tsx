import { Info, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AboutPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="size-4 text-muted-foreground" />
          Why Semantic Journey?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <p>
          Traditional automated accessibility tools are excellent at deterministic rules. Some
          accessibility failures, however, depend on context and interaction:
        </p>
        <ul className="space-y-1">
          <li>• Was a state change understandable?</li>
          <li>• Was feedback communicated after an action?</li>
          <li>• Did focus preserve context?</li>
          <li>• Can a user discover what to do next?</li>
        </ul>
        <p>
          Semantic Journey combines deterministic testing with structured semantic judgments over
          browser accessibility state transitions.
        </p>
        <div className="flex gap-2 rounded-md border border-dashed px-3 py-2 text-[11px]">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Semantic Journey is an accessibility testing aid. Results should not be interpreted as
            certification of WCAG conformance. Contextual findings may require expert review and
            testing with real assistive technologies.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
