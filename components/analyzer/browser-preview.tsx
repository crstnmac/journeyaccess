import type { AXNode } from "@/types/accessibility";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { SemanticTree } from "./semantic-tree";

export function BrowserPreview({
  before,
  after,
  afterTree,
  focusAfter,
  note,
}: {
  before?: string;
  after?: string;
  afterTree: AXNode[];
  focusAfter?: string;
  note?: string;
}) {
  const highlights: Record<string, "focused"> = {};
  const focused = afterTree.find((node) => node.focused);
  if (focused) highlights[focused.id] = "focused";

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What the browser renders
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {after ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={after}
                alt="Screenshot after the action"
                className="w-full rounded-md border"
              />
              <p className="text-[11px] text-muted-foreground">After the action</p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No screenshot captured.</p>
          )}
          {before ? (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Show before</summary>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={before} alt="Screenshot before the action" className="mt-2 w-full rounded-md border" />
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What accessibility APIs expose
          </CardTitle>
          {focusAfter ? (
            <Badge variant="info" className="font-mono text-[11px]">
              focus: {focusAfter}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          <SemanticTree nodes={afterTree} highlights={highlights} maxRows={60} />
        </CardContent>
      </Card>

      {note ? (
        <p className="lg:col-span-2 rounded-md border border-friction/30 bg-friction/5 px-3 py-2 text-xs text-friction">
          {note}
        </p>
      ) : null}
    </div>
  );
}
