import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { JourneyReport } from "@/types/analysis";

import { Stat, StatusBadge } from "./shared";

export function ReportSummary({ report }: { report: JourneyReport }) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Goal
            </div>
            <p className="max-w-2xl text-sm">{report.target.goal}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{report.target.url}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={report.status} />
            <Badge variant="outline" className="font-mono text-[11px]">
              {report.target.mode} mode
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Actions" value={report.steps.length} />
          <Stat label="Semantic issues" value={report.semanticFindings.length} />
          <Stat label="axe issues" value={report.axeFindings.length} />
          <Stat label="Manual review" value={report.requiresManualReview ? "Yes" : "No"} />
        </div>

        <ul className="space-y-1 text-sm">
          {report.summary.map((line, index) => (
            <li key={index} className="flex gap-2 text-foreground/90">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {report.fallbackUsed ? (
          <p className="rounded-md border border-friction/30 bg-friction/5 px-3 py-2 text-xs text-friction">
            Semantic model unavailable — fallback analysis used
            {report.fallbackReason ? ` (${report.fallbackReason})` : ""}. Deterministic judgments
            were used for the affected transitions.
          </p>
        ) : null}

        {report.error ? (
          <p className="rounded-md border border-serious/30 bg-serious/5 px-3 py-2 text-xs text-serious">
            {report.error}
          </p>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Duration {(report.durationMs / 1000).toFixed(1)}s · started{" "}
          {new Date(report.startedAt).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
