import type { AXTreeDiff, AXTreeDiffEntry } from "@/types/accessibility";

const KIND_PREFIX: Record<AXTreeDiffEntry["kind"], string> = {
  added: "+",
  removed: "-",
  changed: "~",
  focus_changed: "FOCUS",
  state_changed: "STATE",
  name_changed: "NAME",
  role_changed: "ROLE",
  live_region_changed: "LIVE",
};

function entryText(entry: AXTreeDiffEntry): string {
  const prefix = KIND_PREFIX[entry.kind];
  if (entry.kind === "added" || entry.kind === "removed") {
    return `${prefix} ${entry.path}`;
  }
  const detail = [entry.before, entry.after].filter(Boolean).join(" → ");
  const fields = entry.fields && entry.fields.length > 0 ? ` (${entry.fields.join(", ")})` : "";
  return detail ? `${prefix} ${entry.path}: ${detail}${fields}` : `${prefix} ${entry.path}${fields}`;
}

function toneFor(kind: AXTreeDiffEntry["kind"]): string {
  switch (kind) {
    case "added":
      return "diff-added";
    case "removed":
      return "diff-removed";
    case "focus_changed":
      return "focus-ring-node";
    case "live_region_changed":
      return "diff-added";
    default:
      return "diff-changed";
  }
}

export function TreeDiff({ diff }: { diff: AXTreeDiff }) {
  if (diff.entries.length === 0) {
    return (
      <div className="evidence-mono text-muted-foreground">
        No semantic change was detected between the before and after accessibility trees.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="evidence-mono scroll-thin max-h-[360px] space-y-0.5 overflow-auto">
        {diff.entries.map((entry, index) => (
          <div key={index} className={`rounded-sm px-1.5 py-0.5 ${toneFor(entry.kind)}`}>
            {entryText(entry)}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="rounded bg-pass/10 px-1.5 py-0.5">+{diff.added} added</span>
        <span className="rounded bg-serious/10 px-1.5 py-0.5">-{diff.removed} removed</span>
        <span className="rounded bg-friction/15 px-1.5 py-0.5">~{diff.changed} changed</span>
        <span className="rounded bg-muted px-1.5 py-0.5">
          focus {diff.focusChanged ? "changed" : "unchanged"}
        </span>
        <span className="rounded bg-muted px-1.5 py-0.5">
          live regions {diff.liveRegionsAdded.length > 0 ? `+${diff.liveRegionsAdded.length}` : "none added"}
        </span>
      </div>
    </div>
  );
}
