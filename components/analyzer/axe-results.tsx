import { ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AxeFinding } from "@/types/accessibility";

import { SectionTitle } from "./shared";

const IMPACT_VARIANT = {
  minor: "muted",
  moderate: "friction",
  serious: "serious",
  critical: "serious",
} as const;

export function AxeResults({ findings }: { findings: AxeFinding[] }) {
  return (
    <section className="space-y-3">
      <SectionTitle
        title="Rules-based checks"
        subtitle="Powered by axe-core — deterministic, standards-based findings. Kept separate from semantic judgments."
        badge={
          <Badge variant="outline" className="font-mono">
            {findings.length} {findings.length === 1 ? "finding" : "findings"}
          </Badge>
        }
      />
      {findings.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No axe-core violations were detected in the captured states. This does not mean the
            interface is accessible — deterministic rules cannot evaluate whether a state transition
            preserved meaning.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((finding) => (
            <Card key={finding.id}>
              <CardHeader className="gap-2 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  {finding.impact ? (
                    <Badge variant={IMPACT_VARIANT[finding.impact] ?? "muted"} className="uppercase">
                      {finding.impact}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {finding.id}
                  </Badge>
                </div>
                <p className="text-sm font-medium">{finding.help}</p>
                <p className="text-xs text-muted-foreground">{finding.description}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {finding.nodes.slice(0, 3).map((node, index) => (
                  <div key={index} className="rounded-md bg-muted/60 px-3 py-2">
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {node.target.join(" ")}
                    </div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/80">
                      {node.html.slice(0, 240)}
                    </pre>
                    {node.failureSummary ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{node.failureSummary}</p>
                    ) : null}
                  </div>
                ))}
                {finding.helpUrl ? (
                  <a
                    href={finding.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-info hover:underline"
                  >
                    Rule documentation
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
