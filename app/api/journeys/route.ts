import { NextResponse } from "next/server";

import { listReports } from "@/lib/reports/store";
import { startJourney } from "@/lib/journeys/service";
import { analyzeRequestSchema, assertHttpUrl, deriveMode } from "@/lib/journeys/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ reports: listReports(12) });
}

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
  const id = startJourney({
    url: parsed.data.url,
    goal: parsed.data.goal,
    mode,
    maxActions: parsed.data.maxActions,
  });

  return NextResponse.json({ id }, { status: 202 });
}
