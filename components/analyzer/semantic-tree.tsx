import type { AXNode } from "@/types/accessibility";
import { cn } from "@/lib/utils";

export type TreeHighlight = "added" | "removed" | "changed" | "focused";

const ROLE_LABEL: Record<string, string> = {
  StaticText: "text",
  RootWebArea: "document",
  InlineTextBox: "text",
};

export function nodeLabel(node: AXNode): string {
  const role = node.role ? (ROLE_LABEL[node.role] ?? node.role) : "node";
  const name = node.name?.trim();
  return name ? `${role} "${name}"` : role;
}

function stateAnnotations(node: AXNode): string[] {
  const parts: string[] = [];
  if (node.focused) parts.push("focused=true");
  if (node.disabled) parts.push("disabled=true");
  if (node.expanded !== undefined) parts.push(`expanded=${node.expanded}`);
  if (node.selected !== undefined) parts.push(`selected=${node.selected}`);
  if (node.checked !== undefined) parts.push(`checked=${node.checked}`);
  if (node.required) parts.push("required=true");
  if (node.invalid) parts.push("invalid=true");
  if (node.level !== undefined) parts.push(`level=${node.level}`);
  if (node.live) parts.push(`live=${node.live}`);
  if (node.atomic) parts.push("atomic=true");
  if (node.haspopup) parts.push(`haspopup=${node.haspopup}`);
  if (node.value) parts.push(`value="${node.value}"`);
  if (node.description) parts.push(`description="${node.description}"`);
  return parts;
}

type TreeRow = { node: AXNode; depth: number };

function rowsFor(nodes: AXNode[]): TreeRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depthOf = (node: AXNode): number => {
    let depth = 0;
    let current: AXNode | undefined = node;
    const seen = new Set<string>();
    while (current?.parentId && byId.has(current.parentId) && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      current = byId.get(current.parentId);
      depth += 1;
      if (depth > 12) break;
    }
    return depth;
  };
  return nodes.map((node) => ({ node, depth: depthOf(node) }));
}

export function SemanticTree({
  nodes,
  highlights = {},
  maxRows,
  className,
}: {
  nodes: AXNode[];
  highlights?: Record<string, TreeHighlight>;
  maxRows?: number;
  className?: string;
}) {
  const rows = rowsFor(nodes);
  const visible = typeof maxRows === "number" ? rows.slice(0, maxRows) : rows;

  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground">No meaningful accessibility nodes were captured.</p>;
  }

  return (
    <div className={cn("evidence-mono scroll-thin max-h-[420px] overflow-auto", className)}>
      {visible.map(({ node, depth }) => {
        const highlight = highlights[node.id];
        return (
          <div
            key={node.id}
            className={cn(
              "rounded-sm px-1",
              highlight === "added" && "diff-added",
              highlight === "removed" && "diff-removed",
              highlight === "changed" && "diff-changed",
              highlight === "focused" && "focus-ring-node",
            )}
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
          >
            <span className="text-foreground/90">{nodeLabel(node)}</span>
            {stateAnnotations(node).length > 0 ? (
              <span className="text-muted-foreground"> {stateAnnotations(node).join(" ")}</span>
            ) : null}
          </div>
        );
      })}
      {rows.length > visible.length ? (
        <div className="px-1 pt-1 text-muted-foreground">… {rows.length - visible.length} more nodes</div>
      ) : null}
    </div>
  );
}
