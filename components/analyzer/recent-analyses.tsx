import Link from "next/link";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { JourneySummaryRow } from "@/types/analysis";

import { StatusBadge } from "./shared";

function targetLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

export function RecentAnalyses({ rows }: { rows: JourneySummaryRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No analyses yet. Run the demo journey to create the first report.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Goal</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
                <th className="px-4 py-2.5 font-medium">Semantic</th>
                <th className="px-4 py-2.5 font-medium">axe</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <Link href={`/analysis/${row.id}`} className="font-mono text-[11px] text-info hover:underline">
                      {targetLabel(row.url)}
                    </Link>
                    <div className="mt-0.5">
                      <Badge variant="muted" className="text-[10px] uppercase">
                        {row.mode}
                      </Badge>
                    </div>
                  </td>
                  <td className="max-w-[280px] px-4 py-2.5 text-muted-foreground">
                    <span className="line-clamp-2">{row.goal}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{row.semanticFindingCount}</td>
                  <td className="px-4 py-2.5 tabular-nums">{row.axeFindingCount}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {new Date(row.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecentAnalysesHeader() {
  return (
    <div className="flex items-center gap-2">
      <History className="size-4 text-muted-foreground" />
      <h2 className="text-base font-semibold">Recent analyses</h2>
    </div>
  );
}
