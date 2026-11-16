"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bug, GitCompareArrows, Loader2, ScanSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { JourneyReport } from "@/types/analysis";
import type { JourneyRunState } from "@/types/journey";

import { AboutPanel } from "./about-panel";
import { AxeResults } from "./axe-results";
import { Comparison } from "./comparison";
import { DebugPanel } from "./debug-panel";
import { IssueCard } from "./issue-card";
import { LiveBrowser } from "./live-browser";
import { JourneyTimeline } from "./journey-timeline";
import { RunningState } from "./running-state";
import { SectionTitle } from "./shared";
import { ReportSummary } from "./summary";

type RunPayload = { run: JourneyRunState | null; report: JourneyReport | null };

export function AnalysisView({
  id,
  initialRun,
  initialReport,
  compareReport,
  debug: initialDebug,
}: {
  id: string;
  initialRun: JourneyRunState | null;
  initialReport: JourneyReport | null;
  compareReport: JourneyReport | null;
  debug: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<JourneyRunState | null>(initialRun);
  const [report, setReport] = useState<JourneyReport | null>(initialReport);
  const [debug, setDebug] = useState(initialDebug);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (report) {
      stopPolling();
      return;
    }
    const poll = async () => {
      try {
        const response = await fetch(`/api/journeys/${id}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as RunPayload;
        if (payload.run) setRun(payload.run);
        if (payload.report) {
          setReport(payload.report);
          stopPolling();
        }
      } catch {
        // Keep polling; transient dev-server reloads are common.
      }
    };
    void poll();
    pollRef.current = setInterval(poll, 900);
    return stopPolling;
  }, [id, report, stopPolling]);

  useEffect(() => {
    if (!debug) return;
    const url = new URL(window.location.href);
    url.searchParams.set("debug", "true");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [debug, router]);

  const steps = report?.steps ?? run?.steps ?? [];
  const goal = report?.target.goal ?? run?.goal ?? "…";

  // The viewed report may be either side of the comparison; label the columns
  // by each report's own mode rather than by which one was opened first.
  const comparison = useMemo(() => {
    if (!report || !compareReport) return null;
    const modes = new Set([report.target.mode, compareReport.target.mode]);
    if (!modes.has("broken") || !modes.has("fixed")) return null;
    return {
      broken: report.target.mode === "broken" ? report : compareReport,
      fixed: report.target.mode === "fixed" ? report : compareReport,
    };
  }, [report, compareReport]);

  const fixedUrl = useMemo(() => {
    if (!report) return null;
    try {
      const url = new URL(report.target.url);
      url.searchParams.set("mode", "fixed");
      return url.toString();
    } catch {
      return null;
    }
  }, [report]);

  async function runComparison() {
    if (!report || !fixedUrl) return;
    setComparing(true);
    setCompareError(null);
    try {
      const response = await fetch("/api/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fixedUrl, goal: report.target.goal }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? `Request failed with ${response.status}`);
      }
      router.push(`/analysis/${payload.id}?compare=${report.id}`);
    } catch (error) {
      setCompareError(error instanceof Error ? error.message : String(error));
      setComparing(false);
    }
  }

  const showCompareCta =
    report !== null && report.target.mode === "broken" && !compareReport && fixedUrl !== null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Semantic Journey
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Semantic journey report</h1>
          <p className="text-xs text-muted-foreground">
            Accessibility state transitions captured through Chromium, judged by Jev.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            id {id}
          </Badge>
          <Button variant={debug ? "secondary" : "outline"} size="sm" onClick={() => setDebug(!debug)}>
            <Bug />
            Developer evidence
          </Button>
        </div>
      </header>

      {!report ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1.7fr_1fr]">
          <LiveBrowser
            id={id}
            active={run?.status === "running" || run?.status === "queued"}
            phase={run?.phase ?? "queued"}
            message={run?.message ?? "Queued"}
            steps={steps}
            goal={goal}
          />
          <RunningState
            phase={run?.phase ?? "queued"}
            message={run?.message ?? "Queued"}
            steps={steps}
            goal={goal}
          />
        </div>
      ) : (
        <>
          <ReportSummary report={report} />

          {showCompareCta ? (
            <Card className="border-info/30 bg-info/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <GitCompareArrows className="size-4 text-info" />
                    Compare with fixed implementation
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Run the identical journey against the properly implemented version of the same
                    UI and see whether the semantic issues disappear.
                  </p>
                  {compareError ? <p className="text-xs text-serious">{compareError}</p> : null}
                </div>
                <Button onClick={runComparison} disabled={comparing}>
                  {comparing ? <Loader2 className="animate-spin" /> : <GitCompareArrows />}
                  Run fixed journey
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {comparison ? <Comparison broken={comparison.broken} fixed={comparison.fixed} /> : null}

          <JourneyTimeline steps={report.steps} debug={debug} />

          <section className="space-y-3">
            <SectionTitle
              title="Semantic observations"
              subtitle="Evaluated by Jev over accessibility state transitions. Contextual, not WCAG results."
              badge={
                <Badge variant="outline" className="font-mono">
                  {report.semanticFindings.length} findings
                </Badge>
              }
            />
            {report.semanticFindings.length === 0 ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-6 text-sm text-pass">
                  <ScanSearch className="size-4" />
                  No semantic issues were detected in this journey.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {report.semanticFindings.map((finding) => (
                  <IssueCard key={finding.id} finding={finding} />
                ))}
              </div>
            )}
          </section>

          <AxeResults findings={report.axeFindings} />

          <AboutPanel />

          {debug ? (
            <section className="space-y-2">
              <SectionTitle
                title="Developer evidence"
                subtitle="Raw captured state, model inputs and outputs for this journey."
              />
              <DebugPanel
                sections={[
                  { title: "Report", data: report },
                  { title: "Steps (full transitions)", data: report.steps.map((step) => step.transition) },
                  {
                    title: "Jev inputs and outputs",
                    data: report.steps.map((step) => ({
                      step: step.step,
                      judgments: step.evaluation.judgments,
                      findings: step.evaluation.findings,
                      raw: step.evaluation.raw,
                    })),
                  },
                  { title: "axe findings", data: report.axeFindings },
                ]}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
