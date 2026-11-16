import assert from "node:assert/strict";
import { test } from "node:test";

// Node's test runner resolves explicit .ts extensions (see tsconfig allowImportingTsExtensions).
import { describeNode } from "../../lib/accessibility/capture-ax-tree.ts";
import { normalizeAXTree, renderAXTree, treeEvidence } from "../../lib/accessibility/normalize-tree.ts";
import { diffAXTrees, renderDiff } from "../../lib/accessibility/diff-tree.ts";
import { describeFocus, focusFromAXTree, mergeFocus } from "../../lib/accessibility/focus.ts";

type AXNode = Parameters<typeof normalizeAXTree>[0][number];

function axNode(partial: Partial<AXNode> & { id: string }): AXNode {
  return { ...partial };
}

const rawTree: AXNode[] = [
  axNode({
    id: "root",
    role: "RootWebArea",
    name: "Shop",
    childIds: ["gen", "empty", "btn", "status", "ignored", "deco", "present"],
  }),
  axNode({ id: "gen", role: "generic", parentId: "root", childIds: ["heading", "para"] }),
  axNode({ id: "heading", role: "heading", name: "Wireless Headphones", level: 1, parentId: "gen" }),
  axNode({ id: "para", role: "paragraph", parentId: "gen", childIds: ["text"] }),
  axNode({ id: "text", role: "StaticText", name: "Only 2 left", parentId: "para" }),
  axNode({ id: "empty", role: "StaticText", name: "   ", parentId: "root" }),
  axNode({ id: "btn", role: "button", name: "Add to cart", focused: true, parentId: "root" }),
  axNode({ id: "status", role: "status", name: "Cart updated", parentId: "root" }),
  axNode({ id: "ignored", role: "button", name: "Hidden", ignored: true, parentId: "root" }),
  axNode({ id: "deco", role: "image", parentId: "root" }),
  axNode({ id: "present", role: "presentation", parentId: "root", childIds: ["present-child"] }),
  axNode({ id: "present-child", role: "StaticText", name: "Kept", parentId: "present" }),
];

test("normalizeAXTree drops ignored and presentational nodes, keeps focused/interactive/live", () => {
  const normalized = normalizeAXTree(rawTree);
  assert.deepEqual(
    normalized.map((node) => node.id),
    ["root", "gen", "heading", "para", "text", "btn", "status", "present-child"],
  );

  const ids = new Set(normalized.map((node) => node.id));
  assert.equal(ids.has("empty"), false, "empty StaticText dropped");
  assert.equal(ids.has("ignored"), false, "ignored node dropped");
  assert.equal(ids.has("deco"), false, "unnamed image dropped");
  assert.equal(ids.has("present"), false, "presentation role dropped");

  const presentChild = normalized.find((node) => node.id === "present-child");
  // A child of a dropped wrapper reparents to the nearest retained ancestor,
  // so the tree stays connected (Chromium nests most content under ignored
  // `none`/`generic` wrappers).
  assert.equal(presentChild?.parentId, "root", "child of a dropped wrapper reparents upward");

  const button = normalized.find((node) => node.id === "btn");
  assert.equal(button?.focused, true);
  assert.equal(button?.parentId, "root");

  const status = normalized.find((node) => node.id === "status");
  assert.equal(status?.role, "status", "live region role kept");

  const heading = normalized.find((node) => node.id === "heading");
  assert.equal(heading?.parentId, "gen", "generic ancestor retained to keep tree connected");
});

test("normalizeAXTree caps nodes but always keeps the focused chain", () => {
  const nodes: AXNode[] = [
    axNode({ id: "root", role: "main", childIds: ["a", "b", "c", "wrap"] }),
    axNode({ id: "a", role: "button", name: "A", parentId: "root" }),
    axNode({ id: "b", role: "button", name: "B", parentId: "root" }),
    axNode({ id: "c", role: "button", name: "C", parentId: "root" }),
    axNode({ id: "wrap", role: "generic", parentId: "root", childIds: ["deep"] }),
    axNode({ id: "deep", role: "button", name: "Deep", focused: true, parentId: "wrap" }),
  ];
  const capped = normalizeAXTree(nodes, { maxNodes: 4 });
  const cappedIds = capped.map((node) => node.id);
  assert.equal(capped.length, 4);
  assert.ok(cappedIds.includes("deep"), "focused node kept");
  assert.ok(cappedIds.includes("wrap"), "focused ancestor kept");
  assert.ok(cappedIds.includes("root"), "focused ancestor chain kept");
  assert.ok(cappedIds.includes("a"));
  assert.equal(cappedIds.includes("b"), false);
  assert.equal(cappedIds.includes("c"), false);
});

test("renderAXTree produces the indented compact representation", () => {
  const tree: AXNode[] = [
    axNode({ id: "main", role: "main", childIds: ["h", "t", "b1", "b2"] }),
    axNode({ id: "h", role: "heading", name: "Wireless Headphones", level: 1, parentId: "main" }),
    axNode({ id: "t", role: "StaticText", name: "Only 2 left", parentId: "main" }),
    axNode({ id: "b1", role: "button", name: "Add to cart", focused: true, parentId: "main" }),
    axNode({ id: "b2", role: "button", name: "More", parentId: "main" }),
  ];
  const normalized = normalizeAXTree(tree);
  assert.equal(
    renderAXTree(normalized),
    [
      "main",
      '  heading "Wireless Headphones" level=1',
      '  text "Only 2 left"',
      '  button "Add to cart" focused=true',
      '  button "More"',
    ].join("\n"),
  );

  const evidence = treeEvidence(normalized);
  assert.deepEqual(evidence.interactive, ['button "Add to cart"', 'button "More"']);
  assert.equal(evidence.focused?.name, "Add to cart");
  assert.deepEqual(evidence.headings, ['heading "Wireless Headphones" level=1']);
  assert.equal(evidence.liveRegions.length, 0);
  assert.ok(evidence.summary.includes('button "Add to cart" focused=true'));

  const renderedFull = renderAXTree(normalizeAXTree(rawTree));
  assert.equal(
    renderedFull,
    [
      'RootWebArea "Shop"',
      "  generic",
      '    heading "Wireless Headphones" level=1',
      "    paragraph",
      '      text "Only 2 left"',
      '  button "Add to cart" focused=true',
      '  status "Cart updated"',
      '  text "Kept"',
    ].join("\n"),
  );
});

test("diffAXTrees reports added, removed, changed, focus and live regions", () => {
  const before: AXNode[] = [
    axNode({ id: "main", role: "main", childIds: ["btn", "qty", "more"] }),
    axNode({ id: "btn", role: "button", name: "Add to cart", focused: true, parentId: "main" }),
    axNode({ id: "qty", role: "textbox", name: "Quantity", value: "0", parentId: "main" }),
    axNode({ id: "more", role: "button", name: "More", parentId: "main" }),
  ];
  const after: AXNode[] = [
    axNode({ id: "main", role: "main", childIds: ["btn", "qty", "more", "open", "status"] }),
    axNode({ id: "btn", role: "button", name: "Add to cart", parentId: "main" }),
    axNode({ id: "qty", role: "textbox", name: "Quantity", value: "1", parentId: "main" }),
    axNode({ id: "more", role: "button", name: "More items", parentId: "main" }),
    axNode({ id: "open", role: "button", name: "Open cart", focused: true, parentId: "main" }),
    axNode({ id: "status", role: "status", name: "Added to cart", parentId: "main" }),
  ];

  const diff = diffAXTrees(normalizeAXTree(before), normalizeAXTree(after));
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 0);
  assert.equal(diff.changed, 3);
  assert.equal(diff.focusChanged, true);
  assert.deepEqual(diff.liveRegionsAdded, ['status "Added to cart"']);

  const focusEntry = diff.entries.find((entry) => entry.kind === "focus_changed");
  assert.ok(focusEntry);
  assert.equal(focusEntry.path, 'button "Add to cart"');
  assert.deepEqual(focusEntry.fields, ["focused"]);
  assert.equal(focusEntry.before, "focused=true");
  assert.equal(focusEntry.after, "focused=false");

  const stateEntry = diff.entries.find((entry) => entry.kind === "state_changed");
  assert.ok(stateEntry);
  assert.equal(stateEntry.path, 'textbox "Quantity"');
  assert.deepEqual(stateEntry.fields, ["value"]);

  const nameEntry = diff.entries.find((entry) => entry.kind === "name_changed");
  assert.ok(nameEntry);
  assert.equal(nameEntry.path, 'button "More"');
  assert.equal(nameEntry.before, 'name "More"');
  assert.equal(nameEntry.after, 'name "More items"');

  const lines = renderDiff(diff);
  assert.ok(lines.includes('+ button "Open cart"'));
  assert.ok(lines.includes('+ status "Added to cart"'));
  assert.ok(lines.includes("FOCUS changed"));
  assert.ok(lines.includes('LIVE status "Added to cart"'));
  assert.ok(lines.includes('~ button "Add to cart" focused=true → focused=false'));

  const removal = diffAXTrees(normalizeAXTree([axNode({ id: "buy", role: "button", name: "Buy" })]), []);
  assert.equal(removal.removed, 1);
  assert.equal(removal.entries[0]?.kind, "removed");
  assert.ok(renderDiff(removal).includes('- button "Buy"'));

  const unchanged = diffAXTrees(normalizeAXTree(before), normalizeAXTree(before));
  assert.equal(unchanged.changed, 0);
  assert.equal(unchanged.focusChanged, false);
  assert.ok(renderDiff(unchanged).includes("FOCUS unchanged"));
  assert.ok(renderDiff(unchanged).includes("LIVE none added"));
});

test("describeNode and describeFocus formats", () => {
  assert.equal(describeNode({ id: "n1", role: "button", name: "Add to cart" }), 'button "Add to cart"');
  assert.equal(describeNode({ id: "n2", role: "StaticText", name: "Only 2 left" }), 'text "Only 2 left"');
  assert.equal(describeNode({ id: "n3", role: "main" }), "main");

  assert.equal(describeFocus(null), "none");
  assert.equal(describeFocus({ role: "button", name: "Add to cart" }), 'button "Add to cart"');
  assert.equal(describeFocus({ role: "generic" }), "generic");

  assert.deepEqual(focusFromAXTree(normalizeAXTree(rawTree)), {
    role: "button",
    name: "Add to cart",
  });
  assert.equal(focusFromAXTree([]), null);

  const rootFocused: AXNode[] = [
    axNode({ id: "root", role: "RootWebArea", name: "Shop", focused: true, childIds: ["b"] }),
    axNode({ id: "b", role: "button", name: "B", focused: true, parentId: "root" }),
  ];
  assert.deepEqual(focusFromAXTree(rootFocused), { role: "button", name: "B" });

  assert.deepEqual(mergeFocus({ role: "button", selector: "#b" }, { name: "Add to cart" }), {
    role: "button",
    selector: "#b",
    name: "Add to cart",
  });
  assert.deepEqual(mergeFocus(null, { role: "button", name: "X" }), { role: "button", name: "X" });
  assert.equal(mergeFocus(null, null), null);
});
