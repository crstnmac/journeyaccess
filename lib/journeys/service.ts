import { randomUUID } from "node:crypto";

import { runJourney } from "@/lib/browser/journey";
import { saveReport } from "@/lib/reports/store";
import type { JourneyMode } from "@/types/journey";

import { appendStep, completeRun, createRun, failRun, setRunPage, updateRun } from "./registry";

export type StartJourneyInput = {
  url: string;
  goal: string;
  mode: JourneyMode;
  maxActions?: number;
};

export function startJourney(input: StartJourneyInput): string {
  const id = randomUUID().slice(0, 8);
  createRun(id, { message: "Queued", goal: input.goal, url: input.url });

  void (async () => {
    try {
      updateRun(id, { status: "running", phase: "launch", message: "Launching Chromium" });
      const report = await runJourney({
        url: input.url,
        goal: input.goal,
        mode: input.mode,
        maxActions: input.maxActions,
        onPage: (page) => setRunPage(id, page),
        onEvent: (event) => {
          if (event.type === "status") {
            updateRun(id, { phase: event.phase, message: event.message });
          } else if (event.type === "step") {
            appendStep(id, event.step);
          }
        },
      });
      saveReport(report);
      completeRun(id, report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[semantic-journey] journey ${id} failed: ${message}`);
      failRun(id, message);
    }
  })();

  return id;
}
