import { NextResponse } from "next/server";

import { getRun } from "@/lib/journeys/registry";
import { getReport } from "@/lib/reports/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = getRun(id);
  const report = run?.report ?? getReport(id);

  if (!run && !report) {
    return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  }

  return NextResponse.json({
    run: run
      ? {
          id: run.id,
          status: run.status,
          phase: run.phase,
          message: run.message,
          goal: run.goal,
          url: run.url,
          steps: run.steps,
          error: run.error,
          startedAt: run.startedAt,
          reportId: run.reportId,
        }
      : null,
    report: report ?? null,
  });
}
