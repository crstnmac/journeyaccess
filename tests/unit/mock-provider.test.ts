import assert from "node:assert/strict";
import { test } from "node:test";

// Node's test runner resolves explicit .ts extensions (see tsconfig allowImportingTsExtensions).
import { MockJevProvider } from "../../lib/jev/mock-provider.ts";

type Signals = {
  visibleConfirmationTexts: string[];
  liveRegionAdded: boolean;
  statusRoleAdded: boolean;
  focusChanged: boolean;
  focusStayedOnTrigger: boolean;
  dialogRolePresent: boolean;
  dialogRoleAdded: boolean;
  focusInsideDialog: boolean;
  modalLikeVisualChange: boolean;
  largeVisualChange: boolean;
  newInteractiveCount: number;
  removedInteractiveCount: number;
  ambiguousControls: string[];
  weakAssociations: string[];
  urlChanged: boolean;
  cartCountChanged: string[];
  goalKeywordsPresent: string[];
  goalControlsVisible: string[];
};

function emptySignals(overrides: Partial<Signals> = {}): Signals {
  return {
    visibleConfirmationTexts: [],
    liveRegionAdded: false,
    statusRoleAdded: false,
    focusChanged: false,
    focusStayedOnTrigger: false,
    dialogRolePresent: false,
    dialogRoleAdded: false,
    focusInsideDialog: false,
    modalLikeVisualChange: false,
    largeVisualChange: false,
    newInteractiveCount: 1,
    removedInteractiveCount: 0,
    ambiguousControls: [],
    weakAssociations: [],
    urlChanged: false,
    cartCountChanged: [],
    goalKeywordsPresent: [],
    goalControlsVisible: [],
    ...overrides,
  };
}

function input(signals: Partial<Signals>, history: string[] = []) {
  return {
    step: 2,
    goal: "Find Wireless Headphones, add them to the cart, open the cart, and continue toward checkout.",
    mode: "broken" as const,
    action: { type: "click" as const, role: "button", accessibleName: "Add to cart" },
    focus: { before: 'button "Add to cart"', after: 'button "Add to cart"' },
    semanticChanges: { added: ['text "Added to cart"'], removed: [], changed: [] },
    domMutations: ['Element added: div.toast'],
    liveRegions: [],
    nearbyAccessibilityState: ['button "Add to cart"'],
    beforeSummary: "main\n  button \"Add to cart\"",
    afterSummary: "main\n  text \"Added to cart\"\n  button \"Add to cart\"",
    signals: emptySignals(signals),
    history,
    notes: [],
  };
}

const provider = new MockJevProvider();

test("mock provider is deterministic", async () => {
  const first = await provider.evaluateTransition(input({ visibleConfirmationTexts: ["Added to cart ✓"] }));
  const second = await provider.evaluateTransition(input({ visibleConfirmationTexts: ["Added to cart ✓"] }));
  assert.deepEqual(first.judgments, second.judgments);
  assert.deepEqual(first.findings, second.findings);
  assert.equal(first.confidence, second.confidence);
});

test("broken add to cart produces a feedback finding", async () => {
  const result = await provider.evaluateTransition(
    input({ visibleConfirmationTexts: ["Added to cart ✓"], focusStayedOnTrigger: true }),
  );
  const feedback = result.findings.find((finding) => finding.category === "feedback");
  assert.ok(feedback, "expected a feedback finding");
  assert.equal(feedback.title, "Potential unannounced action feedback");
  assert.equal(result.judgments.feedback_exposed.value, false);
  assert.equal(result.judgments.impact.value, "friction");
  assert.ok(result.confidence >= 0.9);
});

test("fixed add to cart produces no feedback finding", async () => {
  const result = await provider.evaluateTransition(
    input({ visibleConfirmationTexts: ["Added to cart"], liveRegionAdded: true, statusRoleAdded: true }),
  );
  assert.equal(result.judgments.feedback_exposed.value, true);
  assert.equal(result.findings.some((finding) => finding.category === "feedback"), false);
  assert.equal(result.judgments.impact.value, "none");
});

test("broken modal is a serious context issue with broken focus", async () => {
  const result = await provider.evaluateTransition(
    input(
      {
        modalLikeVisualChange: true,
        dialogRolePresent: false,
        dialogRoleAdded: false,
        focusStayedOnTrigger: true,
        focusChanged: false,
        largeVisualChange: true,
      },
      ["2. Add to cart → FRICTION — Potential unannounced action feedback"],
    ),
  );
  assert.equal(result.judgments.focus_transition.value, "broken");
  const context = result.findings.find((finding) => finding.category === "context");
  assert.ok(context, "expected a context finding");
  assert.equal(context.title, "Overlay appeared without dialog semantics");
  assert.equal(context.impact, "serious");
  assert.equal(result.judgments.impact.value, "serious");
});

test("fixed modal produces no context finding and keeps focus appropriate", async () => {
  const result = await provider.evaluateTransition(
    input({
      modalLikeVisualChange: true,
      dialogRolePresent: true,
      dialogRoleAdded: true,
      focusInsideDialog: true,
      focusChanged: true,
      focusStayedOnTrigger: false,
      largeVisualChange: true,
    }),
  );
  assert.equal(result.findings.some((finding) => finding.category === "context"), false);
  assert.equal(result.judgments.focus_transition.value, "appropriate");
  assert.equal(result.judgments.goal_progress.value, "continue");
  assert.equal(result.judgments.impact.value, "none");
});

test("uncertain goal progress after a serious history", async () => {
  const result = await provider.evaluateTransition(
    input({ urlChanged: true, goalKeywordsPresent: ["checkout"] }, [
      "3. Open cart → SERIOUS — Overlay appeared without dialog semantics",
    ]),
  );
  assert.equal(result.judgments.goal_progress.value, "uncertain");
  const navigation = result.findings.find((finding) => finding.category === "navigation");
  assert.ok(navigation, "expected a navigation finding");
  assert.equal(navigation.title, "Journey continuation is uncertain");
});

test("ambiguous control and weak association observations", async () => {
  const result = await provider.evaluateTransition(
    input({
      ambiguousControls: ['button "More"'],
      weakAssociations: ["Only 2 left"],
      newInteractiveCount: 3,
    }),
  );
  assert.ok(result.findings.some((finding) => finding.title === "Ambiguous control purpose"));
  assert.ok(
    result.findings.some((finding) => finding.title === "Important context is not semantically associated"),
  );
  assert.equal(result.requiresManualReview, true);
});

test("selectNextAction follows the goal order deterministically", async () => {
  const candidates = [
    { id: "action_1", action: "click" as const, role: "link", accessibleName: "Mechanical Keyboard", occurrence: 0 },
    { id: "action_2", action: "click" as const, role: "link", accessibleName: "Wireless Headphones", occurrence: 0 },
    { id: "action_3", action: "click" as const, role: "button", accessibleName: "Add to cart", occurrence: 0 },
    { id: "action_4", action: "click" as const, role: "button", accessibleName: "Open cart", occurrence: 0 },
    { id: "action_5", action: "click" as const, role: "link", accessibleName: "Continue to checkout", occurrence: 0 },
  ];
  const base = {
    step: 1,
    goal: "Find Wireless Headphones, add them to the cart, open the cart, and continue toward checkout.",
    mode: "broken" as const,
    candidates,
    focused: undefined,
    stateSummary: [],
  };

  const first = await provider.selectNextAction({ ...base, history: [] });
  assert.equal(first.candidateId, "action_2");

  const second = await provider.selectNextAction({
    ...base,
    history: ["1. Activate link \"Wireless Headphones\" → PASS"],
  });
  assert.equal(second.candidateId, "action_3");

  const third = await provider.selectNextAction({
    ...base,
    history: ["1. Activate link \"Wireless Headphones\" → PASS", "2. Activate button \"Add to cart\" → FRICTION"],
  });
  assert.equal(third.candidateId, "action_4");

  const fourth = await provider.selectNextAction({
    ...base,
    history: ["2. Activate button \"Add to cart\" → FRICTION", "3. Activate button \"Open cart\" → SERIOUS"],
  });
  assert.equal(fourth.candidateId, "action_5");

  const done = await provider.selectNextAction({
    ...base,
    history: ["4. Activate link \"Continue to checkout\" → PASS"],
  });
  assert.equal(done.candidateId, "done");

  const blocked = await provider.selectNextAction({ ...base, candidates: [], history: [] });
  assert.equal(blocked.candidateId, "blocked");
});
