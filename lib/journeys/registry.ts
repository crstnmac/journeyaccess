import type { Page } from "playwright";

import type { JourneyReport } from "@/types/analysis";
import type { JourneyRunState, JourneyStep } from "@/types/journey";

type GlobalRuns = { __semanticJourneyRuns?: Map<string, JourneyRunState> };
const globalForRuns = globalThis as GlobalRuns;
const runs = (globalForRuns.__semanticJourneyRuns ??= new Map<string, JourneyRunState>());

type GlobalPages = { __semanticJourneyPages?: Map<string, Page> };
const pages = ((globalThis as GlobalPages).__semanticJourneyPages ??= new Map<string, Page>());

/** Attach or detach the live Playwright page used for frame streaming. */
export function setRunPage(id: string, page: Page | null): void {
  if (page) pages.set(id, page);
  else pages.delete(id);
}

export function getRunPage(id: string): Page | undefined {
  return pages.get(id);
}

export function createRun(
  id: string,
  input: { message: string; goal: string; url: string },
): JourneyRunState {
  const run: JourneyRunState = {
    id,
    status: "queued",
    phase: "queued",
    message: input.message,
    goal: input.goal,
    url: input.url,
    steps: [],
    startedAt: new Date().toISOString(),
  };
  runs.set(id, run);
  return run;
}

export function getRun(id: string): JourneyRunState | undefined {
  return runs.get(id);
}

export function updateRun(id: string, patch: Partial<JourneyRunState>): void {
  const run = runs.get(id);
  if (!run) return;
  runs.set(id, { ...run, ...patch });
}

export function appendStep(id: string, step: JourneyStep): void {
  const run = runs.get(id);
  if (!run) return;
  runs.set(id, { ...run, steps: [...run.steps, step] });
}

export function completeRun(id: string, report: JourneyReport): void {
  const run = runs.get(id);
  if (!run) return;
  runs.set(id, {
    ...run,
    status: "complete",
    phase: "done",
    message: "Analysis complete",
    steps: report.steps,
    reportId: report.id,
    report,
  });
}

export function failRun(id: string, message: string): void {
  const run = runs.get(id);
  if (!run) return;
  runs.set(id, { ...run, status: "error", phase: "error", message, error: message });
}

export function listRuns(): JourneyRunState[] {
  return [...runs.values()].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}
