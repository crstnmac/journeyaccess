import { NextResponse } from "next/server";

import { runJourney } from "@/lib/browser/journey";
import { saveReport } from "@/lib/reports/store";
import { analyzeRequestSchema, assertHttpUrl, deriveMode } from "@/lib/journeys/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const parsed = analyzeRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    assertHttpUrl(parsed.data.url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 },
    );
  }

  const mode = parsed.data.mode ?? deriveMode(parsed.data.url);

  try {
    const report = await runJourney({
      url: parsed.data.url,
      goal: parsed.data.goal,
      mode,
      maxActions: parsed.data.maxActions,
    });
    saveReport(report);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
