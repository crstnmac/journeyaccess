import type {
  AXDiffKind,
  AXNode,
  AXTreeDiff,
  AXTreeDiffEntry,
} from "@/types/accessibility";

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

const LIVE_ROLES = new Set(["alert", "status", "log"]);

function isLiveNode(node: AXNode): boolean {
  if (node.live && node.live !== "off") return true;
  return Boolean(node.role && LIVE_ROLES.has(node.role));
}

function keyFor(node: AXNode): string {
  const role = node.role ?? "";
  const name = node.name?.trim() ?? "";
  if (name.length > 0) return `${role}\u0000${name}`;
  return `${role}\u0000\u0000${node.value ?? ""}\u0000${node.description?.trim() ?? ""}`;
}

type Pair = { before: AXNode; after: AXNode };

function bucketPush(buckets: Map<string, AXNode[]>, key: string, node: AXNode): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(node);
  else buckets.set(key, [node]);
}

function matchExact(
  before: AXNode[],
  after: AXNode[],
): { pairs: Pair[]; added: AXNode[]; removed: AXNode[] } {
  const beforeBuckets = new Map<string, AXNode[]>();
  for (const node of before) bucketPush(beforeBuckets, keyFor(node), node);
  const afterBuckets = new Map<string, AXNode[]>();
  for (const node of after) bucketPush(afterBuckets, keyFor(node), node);

  const pairs: Pair[] = [];
  const added: AXNode[] = [];
  const removed: AXNode[] = [];
  const keys = new Set([...beforeBuckets.keys(), ...afterBuckets.keys()]);
  for (const key of keys) {
    const beforeNodes = beforeBuckets.get(key) ?? [];
    const afterNodes = afterBuckets.get(key) ?? [];
    const shared = Math.min(beforeNodes.length, afterNodes.length);
    for (let i = 0; i < shared; i++) {
      pairs.push({ before: beforeNodes[i], after: afterNodes[i] });
    }
    for (let i = shared; i < afterNodes.length; i++) added.push(afterNodes[i]);
    for (let i = shared; i < beforeNodes.length; i++) removed.push(beforeNodes[i]);
  }
  return { pairs, added, removed };
}

/** Pair leftovers by role (name changed) then by name (role changed). */
function matchFuzzy(
  added: AXNode[],
  removed: AXNode[],
): { pairs: Pair[]; added: AXNode[]; removed: AXNode[] } {
  const remainingAdded = [...added];
  const remainingRemoved = [...removed];
  const pairs: Pair[] = [];

  const take = (predicate: (candidate: AXNode, orphan: AXNode) => boolean): void => {
    for (let i = remainingRemoved.length - 1; i >= 0; i--) {
      const orphan = remainingRemoved[i];
      const matchIndex = remainingAdded.findIndex((candidate) => predicate(candidate, orphan));
      if (matchIndex === -1) continue;
      pairs.push({ before: orphan, after: remainingAdded[matchIndex] });
      remainingAdded.splice(matchIndex, 1);
      remainingRemoved.splice(i, 1);
    }
  };

  take((candidate, orphan) => {
    const candidateName = candidate.name?.trim() ?? "";
    const orphanName = orphan.name?.trim() ?? "";
    return (
      (candidate.role ?? "") === (orphan.role ?? "") &&
      candidateName !== orphanName &&
      (candidateName.length > 0 || orphanName.length > 0)
    );
  });
  take((candidate, orphan) => {
    const candidateName = candidate.name?.trim() ?? "";
    const orphanName = orphan.name?.trim() ?? "";
    return (
      candidateName.length > 0 &&
      candidateName === orphanName &&
      (candidate.role ?? "") !== (orphan.role ?? "")
    );
  });

  return { pairs, added: remainingAdded, removed: remainingRemoved };
}

const COMPARED_FIELDS: Array<keyof AXNode> = [
  "focused",
  "disabled",
  "expanded",
  "selected",
  "checked",
  "value",
  "name",
  "role",
  "live",
  "atomic",
  "relevant",
  "description",
  "level",
  "required",
  "invalid",
  "haspopup",
];

const STATE_FIELDS = new Set(["disabled", "expanded", "selected", "checked", "value"]);

function changedFields(before: AXNode, after: AXNode): string[] {
  const fields: string[] = [];
  for (const field of COMPARED_FIELDS) {
    if (before[field] !== after[field]) fields.push(field);
  }
  return fields;
}

function kindFor(fields: string[]): AXDiffKind {
  if (fields.includes("focused")) return "focus_changed";
  if (fields.some((field) => field === "live" || field === "atomic" || field === "relevant")) {
    return "live_region_changed";
  }
  if (fields.includes("role")) return "role_changed";
  if (fields.includes("name")) return "name_changed";
  if (fields.some((field) => STATE_FIELDS.has(field))) return "state_changed";
  return "changed";
}

const BOOLEAN_FIELDS = new Set([
  "focused",
  "disabled",
  "expanded",
  "selected",
  "required",
  "invalid",
  "atomic",
]);

function formatField(field: string, value: unknown): string {
  if (BOOLEAN_FIELDS.has(field)) return `${field}=${value === true}`;
  if (value === undefined || value === null) return `${field}=undefined`;
  if (typeof value === "string") {
    if (field === "name") return `name "${value}"`;
    return `${field}="${value}"`;
  }
  return `${field}=${String(value)}`;
}

function formatFields(node: AXNode, fields: string[]): string {
  return fields.map((field) => formatField(field, node[field as keyof AXNode])).join(", ");
}

const ROOT_ROLES = new Set(["RootWebArea", "document", "webarea"]);

function focusedNode(nodes: AXNode[]): AXNode | undefined {
  return (
    nodes.find((node) => node.focused && !ROOT_ROLES.has(node.role ?? "")) ??
    nodes.find((node) => node.focused)
  );
}

/** Semantic diff of two normalized trees. */
export function diffAXTrees(before: AXNode[], after: AXNode[]): AXTreeDiff {
  const exact = matchExact(before, after);
  const fuzzy = matchFuzzy(exact.added, exact.removed);
  const pairs = [...exact.pairs, ...fuzzy.pairs];

  const entries: AXTreeDiffEntry[] = [];
  for (const node of fuzzy.added) {
    entries.push({ kind: "added", path: describeNode(node), after: describeNode(node), node });
  }
  for (const node of fuzzy.removed) {
    entries.push({ kind: "removed", path: describeNode(node), before: describeNode(node) });
  }
  for (const pair of pairs) {
    const fields = changedFields(pair.before, pair.after);
    if (fields.length === 0) continue;
    entries.push({
      kind: kindFor(fields),
      path: describeNode(pair.before),
      before: formatFields(pair.before, fields),
      after: formatFields(pair.after, fields),
      node: pair.after,
      fields,
    });
  }

  const beforeFocus = focusedNode(before);
  const afterFocus = focusedNode(after);
  const focusChanged =
    entries.some((entry) => entry.kind === "focus_changed") ||
    (beforeFocus ? describeNode(beforeFocus) : "none") !==
      (afterFocus ? describeNode(afterFocus) : "none");

  const liveRegionsAdded: string[] = [];
  const seenLive = new Set<string>();
  const addLive = (line: string): void => {
    if (seenLive.has(line)) return;
    seenLive.add(line);
    liveRegionsAdded.push(line);
  };
  for (const entry of entries) {
    if (entry.kind === "live_region_changed") addLive(entry.path);
    else if (entry.kind === "added" && entry.node && isLiveNode(entry.node)) {
      addLive(describeNode(entry.node));
    }
  }

  return {
    entries,
    added: fuzzy.added.length,
    removed: fuzzy.removed.length,
    changed: entries.filter((entry) => entry.kind !== "added" && entry.kind !== "removed")
      .length,
    focusChanged,
    liveRegionsAdded,
  };
}

/** Human readable diff lines, prefixed by change type. */
export function renderDiff(diff: AXTreeDiff): string[] {
  const lines: string[] = [];
  for (const entry of diff.entries) {
    if (entry.kind === "added") lines.push(`+ ${entry.path}`);
    else if (entry.kind === "removed") lines.push(`- ${entry.path}`);
    else if (entry.before !== undefined && entry.after !== undefined) {
      lines.push(`~ ${entry.path} ${entry.before} → ${entry.after}`);
    } else lines.push(`~ ${entry.path}`);
  }
  lines.push(diff.focusChanged ? "FOCUS changed" : "FOCUS unchanged");
  lines.push(
    diff.liveRegionsAdded.length > 0 ? `LIVE ${diff.liveRegionsAdded.join(", ")}` : "LIVE none added",
  );
  return lines;
}
