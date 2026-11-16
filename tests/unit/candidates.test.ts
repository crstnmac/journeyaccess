import assert from "node:assert/strict";
import { test } from "node:test";

// Node's test runner resolves explicit .ts extensions (see tsconfig allowImportingTsExtensions).
import {
  buildCandidates,
  describeCandidate,
  isDestructive,
  isHarnessControl,
} from "../../lib/browser/candidates.ts";
import type { AXNode } from "../../types/accessibility.ts";

function node(partial: Partial<AXNode> & { id: string }): AXNode {
  return { ...partial };
}

test("destructive names are refused, goal actions are allowed", () => {
  const destructive = [
    "Delete account",
    "Remove item",
    "Buy now",
    "Purchase",
    "Pay $10",
    "Send message",
    "Upload file",
    "Log out",
    "Sign out",
    "Change password",
    "Unsubscribe",
    "Reset all settings",
  ];
  for (const name of destructive) {
    assert.equal(isDestructive(name), true, `${name} should be destructive`);
  }

  const allowed = [
    "Add to cart",
    "Open cart",
    "Continue to checkout",
    "View Wireless Headphones",
    "More",
    "Back to shop",
  ];
  for (const name of allowed) {
    assert.equal(isDestructive(name), false, `${name} should be allowed`);
  }
});

test("analyzer harness controls are never offered as actions", () => {
  assert.equal(isHarnessControl("Broken experience"), true);
  assert.equal(isHarnessControl("Fixed experience"), true);
  assert.equal(isHarnessControl("Broken experience "), true);
  assert.equal(isHarnessControl("View Wireless Headphones"), false);
  assert.equal(isHarnessControl("Experience"), false);

  const tree: AXNode[] = [
    node({ id: "1", role: "link", name: "Broken experience" }),
    node({ id: "2", role: "link", name: "Fixed experience" }),
    node({ id: "3", role: "link", name: "View Wireless Headphones" }),
  ];
  assert.deepEqual(
    buildCandidates(tree).map((candidate) => candidate.accessibleName),
    ["View Wireless Headphones"],
  );
});

test("destructive candidates are excluded from the action space", () => {
  const tree: AXNode[] = [
    node({ id: "1", role: "button", name: "Add to cart" }),
    node({ id: "2", role: "button", name: "Delete account" }),
    node({ id: "3", role: "link", name: "Continue to checkout" }),
    node({ id: "4", role: "button", name: "Buy now" }),
    node({ id: "5", role: "button", name: "Open cart" }),
  ];

  const candidates = buildCandidates(tree);
  const names = candidates.map((candidate) => candidate.accessibleName);

  assert.deepEqual(names, ["Add to cart", "Open cart", "Continue to checkout"]);
  assert.equal(
    candidates.some((candidate) => candidate.destructive),
    false,
    "destructive candidates must not be offered",
  );
});

test("candidates dedupe identical role/name pairs and skip disabled or unnamed controls", () => {
  const tree: AXNode[] = [
    node({ id: "1", role: "link", name: "View product" }),
    node({ id: "2", role: "link", name: "View product" }),
    node({ id: "3", role: "button", name: "Disabled thing", disabled: true }),
    node({ id: "4", role: "button", name: "" }),
    node({ id: "5", role: "button", name: "  " }),
    node({ id: "6", role: "checkbox", name: "Gift wrap" }),
  ];

  const candidates = buildCandidates(tree);
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].accessibleName, "View product");
  assert.equal(candidates[0].occurrence, 0);
  assert.equal(candidates[1].accessibleName, "View product");
  assert.equal(candidates[1].occurrence, 1);
  assert.equal(candidates[2].action, "check");
  assert.match(describeCandidate(candidates[2]), /^Check checkbox "Gift wrap"/);
});
