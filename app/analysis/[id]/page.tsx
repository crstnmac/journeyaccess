import { notFound } from "next/navigation";

import { AnalysisView } from "@/components/analyzer/analysis-view";
import { getRun } from "@/lib/journeys/registry";
import { getReport } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compare?: string; debug?: string }>;
}) {
  const { id } = await params;
  const { compare, debug } = await searchParams;

  const run = getRun(id) ?? null;
  const report = run?.report ?? getReport(id) ?? null;
  if (!run && !report) notFound();

  const compareReport = compare ? (getReport(compare) ?? null) : null;

  return (
    <AnalysisView
      id={id}
      initialRun={run}
      initialReport={report}
      compareReport={compareReport}
      debug={debug === "true"}
    />
  );
}
