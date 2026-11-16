import type { AXNode, TreeEvidence } from "@/types/accessibility";

export type NormalizeOptions = { maxNodes?: number };

const DEFAULT_MAX_NODES = 160;

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "listbox",
  "option",
  "textbox",
  "searchbox",
  "spinbutton",
  "slider",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "treeitem",
  "gridcell",
]);

const LANDMARK_ROLES = new Set([
  "main",
  "nav",
  "banner",
  "contentinfo",
  "complementary",
  "region",
  "form",
  "search",
]);

const LIVE_ROLES = new Set(["alert", "status", "log", "marquee", "timer"]);
const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);
const PRESENTATIONAL_ROLES = new Set(["none", "presentation", "LineBreak"]);
const TEXT_ROLES = new Set(["StaticText", "text"]);

// Local mirrors of capture-ax-tree helpers: Node's test runner cannot resolve
// extensionless imports between .ts files, so this module stays self-contained.
const DISPLAY_ROLES: Record<string, string> = {
  StaticText: "text",
  InlineTextBox: "text",
};

function displayRole(role: string | undefined): string {
  if (!role) return "node";
  return DISPLAY_ROLES[role] ?? role;
}

function describeNode(node: AXNode): string {
  const role = displayRole(node.role);
  const name = node.name?.trim();
  return name ? `${role} "${name}"` : role;
}

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isLiveNode(node: AXNode): boolean {
  if (hasText(node.live) && node.live !== "off") return true;
  return Boolean(node.role && LIVE_ROLES.has(node.role));
}

function isStateful(node: AXNode): boolean {
  return Boolean(
    node.focused ||
      node.disabled ||
      node.expanded ||
      node.selected ||
      node.checked !== undefined,
  );
}

function isDirectlyMeaningful(node: AXNode): boolean {
  if (node.ignored) return false;
  if (isStateful(node)) return true;
  if (hasText(node.description)) return true;
  const role = node.role;
  if (
    role &&
    (INTERACTIVE_ROLES.has(role) ||
      LANDMARK_ROLES.has(role) ||
      LIVE_ROLES.has(role) ||
      DIALOG_ROLES.has(role) ||
      role === "heading")
  ) {
    return true;
  }
  if (isLiveNode(node)) return true;
  if (role && PRESENTATIONAL_ROLES.has(role)) return false;
  if (role === "InlineTextBox") return false;
  if (role && TEXT_ROLES.has(role)) return hasText(node.name);
  if (role === "image" || role === "img") return hasText(node.name);
  if (role === "generic" || role === "group") {
    return hasText(node.name) || hasText(node.description) || hasText(node.value);
  }
  return false;
}

function buildDocumentOrder(byId: Map<string, AXNode>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const indexById = new Map<string, number>();
  let index = 0;
  for (const id of byId.keys()) indexById.set(id, index++);
  const roots: string[] = [];
  for (const [id, node] of byId) {
    const parentId = node.parentId;
    if (!parentId || !byId.has(parentId) || parentId === id) roots.push(id);
  }
  roots.sort((a, b) => (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0));
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
    for (const childId of byId.get(id)?.childIds ?? []) {
      if (byId.has(childId)) visit(childId);
    }
  };
  for (const root of roots) visit(root);
  for (const id of byId.keys()) visit(id);
  return ordered;
}

function canBeAncestor(node: AXNode | undefined): boolean {
  if (!node || node.ignored) return false;
  if (node.focused) return true;
  if (node.role && PRESENTATIONAL_ROLES.has(node.role)) return false;
  if (node.role === "InlineTextBox") return false;
  return true;
}

function ancestorChain(node: AXNode, byId: Map<string, AXNode>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;
  while (parentId && byId.has(parentId) && !seen.has(parentId)) {
    seen.add(parentId);
    const ancestor = byId.get(parentId);
    if (canBeAncestor(ancestor)) chain.push(parentId);
    parentId = ancestor?.parentId;
  }
  return chain;
}

/**
 * Nearest retained ancestor, walking up through nodes that were dropped
 * (ignored/presentational wrappers). Chromium's tree puts most content under
 * ignored `none`/`generic` wrappers, so without this the retained tree falls
 * apart at every ignored boundary and the dialog ancestry of a focused control
 * is lost.
 */
function effectiveParent(
  node: AXNode,
  byId: Map<string, AXNode>,
  retained: Set<string>,
): string | undefined {
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;
  while (parentId && byId.has(parentId) && !seen.has(parentId)) {
    if (retained.has(parentId)) return parentId;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentId;
  }
  return undefined;
}

function rankNode(node: AXNode | undefined): number {
  if (!node) return 5;
  if (node.focused) return 0;
  if (node.role && INTERACTIVE_ROLES.has(node.role)) return 1;
  if (isLiveNode(node)) return 2;
  if (node.role && DIALOG_ROLES.has(node.role)) return 3;
  if (node.role === "heading") return 4;
  return 5;
}

/**
 * Reduce a raw AX tree to the compact semantic tree used for evidence:
 * no ignored/presentational filler, retained ancestors keep it connected,
 * capped at `maxNodes`, ordered in document order.
 */
export function normalizeAXTree(nodes: AXNode[], options?: NormalizeOptions): AXNode[] {
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const byId = new Map<string, AXNode>();
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }

  let retained = new Set<string>();
  for (const node of byId.values()) {
    if (!isDirectlyMeaningful(node)) continue;
    retained.add(node.id);
    for (const ancestorId of ancestorChain(node, byId)) retained.add(ancestorId);
  }

  const documentOrder = buildDocumentOrder(byId);
  const orderIndex = new Map<string, number>();
  documentOrder.forEach((id, index) => orderIndex.set(id, index));

  if (retained.size > maxNodes) {
    const keep = new Set<string>();
    const focused = [...byId.values()].find((node) => node.focused);
    if (focused) {
      keep.add(focused.id);
      for (const ancestorId of ancestorChain(focused, byId)) keep.add(ancestorId);
    }
    const candidates = [...retained]
      .filter((id) => !keep.has(id))
      .sort((a, b) => {
        const rankDiff = rankNode(byId.get(a)) - rankNode(byId.get(b));
        if (rankDiff !== 0) return rankDiff;
        return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
      });
    for (const id of candidates) {
      if (keep.size >= maxNodes) break;
      keep.add(id);
    }
    retained = keep;
  }

  // Rebuild the child links from the effective (flattened) parent so the
  // retained tree stays connected even when ignored wrappers are dropped.
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string | undefined>();
  for (const id of documentOrder) {
    if (!retained.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    const parentId = effectiveParent(node, byId, retained);
    parentOf.set(id, parentId);
    if (!parentId) continue;
    const children = childrenOf.get(parentId) ?? [];
    children.push(id);
    childrenOf.set(parentId, children);
  }

  const output: AXNode[] = [];
  for (const id of documentOrder) {
    if (!retained.has(id)) continue;
    const node = byId.get(id);
    if (!node) continue;
    const copy: AXNode = { ...node };
    const parentId = parentOf.get(id);
    if (parentId) copy.parentId = parentId;
    else delete copy.parentId;
    const childIds = childrenOf.get(id);
    if (childIds && childIds.length > 0) copy.childIds = childIds;
    else delete copy.childIds;
    output.push(copy);
  }
  return output;
}

function depthOf(node: AXNode, byId: Map<string, AXNode>): number {
  let depth = 0;
  let parentId = node.parentId;
  const seen = new Set<string>([node.id]);
  while (parentId && byId.has(parentId) && !seen.has(parentId) && depth < 64) {
    seen.add(parentId);
    depth += 1;
    parentId = byId.get(parentId)?.parentId;
  }
  return depth;
}

function stateParts(node: AXNode): string[] {
  const parts: string[] = [];
  if (node.focused) parts.push("focused=true");
  if (node.disabled) parts.push("disabled=true");
  if (node.expanded !== undefined) parts.push(`expanded=${node.expanded}`);
  if (node.selected) parts.push("selected=true");
  if (node.required) parts.push("required=true");
  if (node.invalid) parts.push("invalid=true");
  if (node.value !== undefined && node.value !== "") parts.push(`value="${node.value}"`);
  if (node.level !== undefined) parts.push(`level=${node.level}`);
  if (node.live) parts.push(`live=${node.live}`);
  if (node.relevant) parts.push(`relevant=${node.relevant}`);
  if (node.atomic) parts.push("atomic=true");
  if (node.haspopup) parts.push(`hasPopup=${node.haspopup}`);
  if (node.checked !== undefined) parts.push(`checked=${node.checked}`);
  if (node.description) parts.push(`description="${node.description}"`);
  return parts;
}

function renderNodeLine(node: AXNode): string {
  const parts = [describeNode(node), ...stateParts(node)];
  return parts.join(" ");
}

/** Indented text tree, two spaces per depth level. */
export function renderAXTree(nodes: AXNode[], options?: { maxLines?: number }): string {
  const maxLines = options?.maxLines ?? Number.POSITIVE_INFINITY;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = nodes.map((node) => {
    const indent = "  ".repeat(depthOf(node, byId));
    return `${indent}${renderNodeLine(node)}`;
  });
  return lines.slice(0, maxLines).join("\n");
}

/** Compact evidence extracted from a normalized tree. */
export function treeEvidence(
  nodes: AXNode[],
  options?: { maxLines?: number; maxInteractive?: number },
): TreeEvidence {
  const maxLines = options?.maxLines ?? 60;
  const maxInteractive = options?.maxInteractive ?? 14;
  const interactive = nodes
    .filter((node) => node.role !== undefined && INTERACTIVE_ROLES.has(node.role))
    .slice(0, maxInteractive)
    .map(describeNode);
  const focused = nodes.find((node) => node.focused) ?? null;
  const liveRegions = nodes.filter(isLiveNode).map(renderNodeLine);
  const dialogs = nodes
    .filter((node) => node.role !== undefined && DIALOG_ROLES.has(node.role))
    .map(renderNodeLine);
  const headings = nodes.filter((node) => node.role === "heading").map(renderNodeLine);
  const summary = renderAXTree(nodes, { maxLines });
  return {
    lines: renderAXTree(nodes).split("\n").filter(Boolean),
    interactive,
    focused,
    liveRegions,
    dialogs,
    headings,
    summary,
  };
}
