import { ArrowRight, Crosshair, MousePointerClick } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { JourneyStep } from "@/types/journey";

import { AxeResults } from "./axe-results";
import { BrowserPreview } from "./browser-preview";
import { DebugPanel } from "./debug-panel";
import { JevDecision } from "./jev-decision";
import { SemanticTree } from "./semantic-tree";
import { TreeDiff } from "./tree-diff";

function highlightMap(
  diff: JourneyStep["transition"]["treeDiff"],
  side: "before" | "after",
): Record<string, "added" | "removed" | "changed"> {
  const highlights: Record<string, "added" | "removed" | "changed"> = {};
  for (const entry of diff.entries) {
    if (!entry.node) continue;
    if (side === "after" && entry.kind === "added") highlights[entry.node.id] = "added";
    if (side === "before" && entry.kind === "removed") highlights[entry.node.id] = "removed";
    if (side === "after" && entry.kind !== "added" && entry.kind !== "removed") {
      highlights[entry.node.id] = "changed";
    }
  }
  return highlights;
}

function FocusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

export function StepDetail({ step, debug }: { step: JourneyStep; debug: boolean }) {
  const { transition } = step;
  const focusBefore = transition.before.focus
    ? `${transition.before.focus.role ?? "?"} "${transition.before.focus.name ?? ""}"`
    : "none";
  const focusAfter = transition.after.focus
    ? `${transition.after.focus.role ?? "?"} "${transition.after.focus.name ?? ""}"`
    : "none";

  return (
    <Tabs defaultValue="diff">
      <TabsList>
        <TabsTrigger value="diff">Accessibility diff</TabsTrigger>
        <TabsTrigger value="inspector">Before / after</TabsTrigger>
        <TabsTrigger value="evidence">DOM &amp; focus</TabsTrigger>
        <TabsTrigger value="axe">axe</TabsTrigger>
        <TabsTrigger value="jev">Jev</TabsTrigger>
        {debug ? <TabsTrigger value="debug">Debug</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="diff" className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <MousePointerClick className="size-3.5" />
              <span className="font-mono">
                {step.action.type} {step.action.role} &quot;{step.action.accessibleName}&quot;
              </span>
              <ArrowRight className="size-3.5" />
              <span>{step.visualChange}</span>
            </div>
            <TreeDiff diff={transition.treeDiff} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="inspector" className="space-y-4">
        <BrowserPreview
          before={step.screenshotBefore}
          after={step.screenshotAfter}
          afterTree={transition.after.axTree}
          focusAfter={focusAfter}
          note={
            step.result === "SERIOUS" || step.result === "FRICTION"
              ? "The visual interface changed, but compare it with the accessibility state on the right."
              : undefined
          }
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Before — accessibility tree
              </div>
              <SemanticTree nodes={transition.before.axTree} highlights={highlightMap(transition.treeDiff, "before")} maxRows={60} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                After — accessibility tree
              </div>
              <SemanticTree nodes={transition.after.axTree} highlights={highlightMap(transition.treeDiff, "after")} maxRows={60} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="evidence" className="space-y-3">
        <Card>
          <CardContent className="space-y-2 pt-5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Crosshair className="size-3.5" />
              Focus
            </div>
            <FocusRow label="Before" value={focusBefore} />
            <FocusRow label="After" value={focusAfter} />
            {transition.after.focus?.selector ? (
              <FocusRow label="Selector" value={transition.after.focus.selector} />
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              DOM mutations ({transition.mutations.length})
            </div>
            {transition.mutations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No meaningful DOM mutations were recorded.</p>
            ) : (
              <div className="evidence-mono scroll-thin max-h-[300px] space-y-0.5 overflow-auto">
                {transition.mutations.map((mutation, index) => (
                  <div key={index} className="rounded-sm px-1.5 py-0.5">
                    <span className="text-muted-foreground">{mutation.type}</span>
                    {mutation.tag ? <span> &lt;{mutation.tag}&gt;</span> : null}
                    {mutation.text ? <span className="text-foreground/90"> {mutation.text}</span> : null}
                    {mutation.attributes?.class ? (
                      <span className="text-muted-foreground"> .{mutation.attributes.class.split(" ")[0]}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="axe">
        <AxeResults
          findings={[
            ...(transition.axeBefore?.findings ?? []),
            ...(transition.axeAfter?.findings ?? []),
          ].filter(
            (finding, index, all) => all.findIndex((other) => other.id === finding.id) === index,
          )}
        />
      </TabsContent>

      <TabsContent value="jev">
        <Card>
          <CardContent className="pt-5">
            <JevDecision evaluation={step.evaluation} />
          </CardContent>
        </Card>
      </TabsContent>

      {debug ? (
        <TabsContent value="debug" className="space-y-2">
          <DebugPanel
            sections={[
              { title: "Selected action", data: step.action },
              { title: "Raw AX tree (before)", data: transition.before.axTree },
              { title: "Raw AX tree (after)", data: transition.after.axTree },
              { title: "Tree diff", data: transition.treeDiff },
              { title: "DOM mutations", data: transition.mutations },
              { title: "Focus snapshots", data: { before: transition.before.focus, after: transition.after.focus } },
              { title: "axe before", data: transition.axeBefore ?? null },
              { title: "axe after", data: transition.axeAfter ?? null },
              { title: "Jev judgment output", data: step.evaluation },
            ]}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}
