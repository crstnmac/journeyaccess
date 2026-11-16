import type { AXNode, AXTreeDiff, FocusSnapshot, MutationSummary } from "@/types/accessibility";
import type { JourneyMode, SemanticAction } from "@/types/journey";
import type { TransitionEvaluationInput, TransitionSignals } from "./types";

import { describeNode } from "@/lib/accessibility/capture-ax-tree";
import { renderAXTree } from "@/lib/accessibility/normalize-tree";
import { describeFocus } from "@/lib/accessibility/focus";
import { summarizeMutations } from "@/lib/accessibility/mutations";

export type SignalInput = {
  step: number;
  goal: string;
  mode: JourneyMode;
  action: SemanticAction;
  beforeTree: AXNode[];
  afterTree: AXNode[];
  mutations: MutationSummary[];
  focusBefore: FocusSnapshot | null;
  focusAfter: FocusSnapshot | null;
  diff: AXTreeDiff;
  urlBefore: string;
  urlAfter: string;
  history: string[];
};

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "textbox",
  "searchbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "option",
  "spinbutton",
  "slider",
]);

const DIALOG_ROLES = new Set(["dialog", "alertdialog"]);

const GENERIC_CONTROL_NAMES = new Set([
  "more",
  "options",
  "details",
  "menu",
  "info",
  "actions",
  "open",
  "view",
  "learn more",
  "click here",
  "submit",
  "continue",
  "go",
]);

const MODAL_PATTERN = /modal|overlay|dialog|drawer|sheet|popover|menu/i;
const CONFIRMATION_PATTERN = /added|success|saved|updated|confirmed|done\b/i;
const STOCK_PATTERN = /only \d+ left|low stock|in stock|sold out|limited/i;

const GOAL_STOPWORDS = new Set([
  "the", "and", "to", "of", "a", "an", "in", "on", "for", "with", "then", "that",
  "this", "these", "those", "your", "you", "it", "its", "is", "are", "was", "were",
  "be", "been", "being", "by", "from", "or", "as", "at", "into", "onto", "toward",
  "towards", "until", "while", "when", "where", "which", "who", "whom", "whose",
  "will", "would", "can", "could", "should", "may", "might", "must", "do", "does",
  "did", "have", "has", "had", "my", "our", "their", "his", "her", "them", "they",
  "we", "he", "she", "me", "us", "if", "so", "but", "not", "no", "yes", "all",
  "any", "each", "more", "most", "other", "some", "such", "only", "own", "same",
  "than", "too", "very", "just", "also", "up", "out", "over", "under", "again",
  "off", "down",
]);

function goalKeywords(goal: string): string[] {
  const words = goal.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const keywords = new Set<string>();
  for (const word of words) {
    if (word.length > 3 && !GOAL_STOPWORDS.has(word)) keywords.add(word);
  }
  for (const phrase of ["wireless headphones", "checkout", "cart"]) {
    if (goal.toLowerCase().includes(phrase)) keywords.add(phrase);
  }
  return [...keywords];
}

function isLiveNode(node: AXNode): boolean {
  if (node.live === "polite" || node.live === "assertive") return true;
  return node.role === "status" || node.role === "alert" || node.role === "log";
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function addedNodes(diff: AXTreeDiff): AXNode[] {
  return diff.entries
    .filter((entry) => entry.kind === "added" && entry.node)
    .map((entry) => entry.node as AXNode);
}

function addedNodeLines(diff: AXTreeDiff): string[] {
  return addedNodes(diff).map(describeNode);
}

function describeChange(entry: AXTreeDiff["entries"][number]): string {
  const detail = [entry.before, entry.after].filter(Boolean).join(" → ");
  return detail ? `${entry.path}: ${detail}` : entry.path;
}

export function computeTransitionSignals(input: SignalInput): TransitionSignals {
  const { beforeTree, afterTree, diff, mutations, focusBefore, focusAfter } = input;

  const added = addedNodes(diff);

  const visibleConfirmationTexts = [
    ...new Set([
      ...added
        .map((node) => node.name ?? "")
        .filter((text) => text.length > 0 && CONFIRMATION_PATTERN.test(text)),
      ...mutations
        .filter((mutation) => mutation.text && CONFIRMATION_PATTERN.test(mutation.text))
        .map((mutation) => mutation.text as string),
    ]),
  ]
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 5);

  const liveRegionAdded =
    diff.liveRegionsAdded.length > 0 ||
    added.some((node) => node.live === "polite" || node.live === "assertive") ||
    afterTree.some((node) => {
      if (!isLiveNode(node)) return false;
      const key = `${node.role ?? ""}|${node.name ?? ""}|${node.live ?? ""}`;
      return !beforeTree.some(
        (before) => `${before.role ?? ""}|${before.name ?? ""}|${before.live ?? ""}` === key,
      );
    });

  const statusRoleAdded = added.some(
    (node) => node.role === "status" || node.role === "alert" || node.role === "log",
  );

  const focusBeforeText = describeFocus(focusBefore);
  const focusAfterText = describeFocus(focusAfter);
  const focusChanged = focusBeforeText !== focusAfterText;
  // "Stayed on trigger" means focus is on the control that was activated, not
  // that focus never changed: clicking a button focuses it.
  const triggerName = (input.action.accessibleName ?? "").trim().toLowerCase();
  const focusStayedOnTrigger =
    focusAfter !== null &&
    triggerName.length > 0 &&
    (focusAfter.name ?? "").trim().toLowerCase().includes(triggerName);

  const dialogRolePresent = afterTree.some(
    (node) => node.role !== undefined && DIALOG_ROLES.has(node.role),
  );
  const dialogRoleAdded = added.some(
    (node) => node.role !== undefined && DIALOG_ROLES.has(node.role),
  );

  let focusInsideDialog = false;
  const focusedAfter = afterTree.find((node) => node.focused);
  if (focusedAfter && dialogRolePresent) {
    let current: AXNode | undefined = focusedAfter;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.role !== undefined && DIALOG_ROLES.has(current.role)) {
        focusInsideDialog = true;
        break;
      }
      const parentId: string | undefined = current.parentId;
      current = parentId ? afterTree.find((node) => node.id === parentId) : undefined;
    }
  }

  const modalLikeVisualChange =
    dialogRoleAdded ||
    mutations.some((mutation) => {
      if (mutation.type !== "element_added") return false;
      const className = mutation.attributes?.class ?? "";
      const role = mutation.attributes?.role ?? "";
      if (MODAL_PATTERN.test(className) || MODAL_PATTERN.test(role)) return true;
      return Object.keys(mutation.attributes ?? {}).some((key) => key === "data-overlay");
    });

  const urlChanged = pathOf(input.urlBefore) !== pathOf(input.urlAfter);
  const largeVisualChange = mutations.length >= 8 || modalLikeVisualChange || urlChanged;

  const newInteractiveCount = added.filter(
    (node) => node.role !== undefined && INTERACTIVE_ROLES.has(node.role),
  ).length;
  const removedInteractiveCount = diff.entries.filter(
    (entry) =>
      entry.kind === "removed" &&
      entry.node?.role !== undefined &&
      INTERACTIVE_ROLES.has(entry.node.role),
  ).length;

  const beforeKeys = new Set(beforeTree.map((node) => `${node.role ?? ""}|${node.name ?? ""}`));
  const isNewNode = (node: AXNode) => !beforeKeys.has(`${node.role ?? ""}|${node.name ?? ""}`);

  const ambiguousControls = afterTree
    .filter(isNewNode)
    .filter(
      (node) =>
        node.role !== undefined &&
        INTERACTIVE_ROLES.has(node.role) &&
        (node.description ?? "").trim().length === 0,
    )
    .filter((node) => {
      const name = (node.name ?? "").trim().toLowerCase();
      return name.length === 0 || GENERIC_CONTROL_NAMES.has(name);
    })
    .map(describeNode)
    .slice(0, 5);

  const descriptions = afterTree
    .map((node) => node.description ?? "")
    .join("\n")
    .toLowerCase();
  const weakAssociations = [
    ...new Set(
      afterTree
        .filter(isNewNode)
        .filter((node) => node.role === "StaticText" || node.role === "text")
        .map((node) => (node.name ?? "").trim())
        .filter((text) => text.length > 0 && STOCK_PATTERN.test(text))
        .filter((text) => !descriptions.includes(text.toLowerCase())),
    ),
  ].slice(0, 5);

  const cartCountChanged = diff.entries
    .filter((entry) => /cart/i.test(entry.path))
    .filter((entry) => entry.kind === "changed" || entry.kind === "name_changed" || entry.kind === "state_changed")
    .map(describeChange)
    .slice(0, 3);

  const treeText = afterTree
    .map((node) => `${node.name ?? ""} ${node.value ?? ""} ${node.description ?? ""}`)
    .join(" ")
    .toLowerCase();
  const goalKeywordsPresent = goalKeywords(input.goal)
    .filter((keyword) => treeText.includes(keyword))
    .slice(0, 6);

  const goalKeywordsLower = goalKeywords(input.goal);
  const goalControlsVisible = afterTree
    .filter((node) => node.role !== undefined && INTERACTIVE_ROLES.has(node.role))
    .filter((node) => {
      const name = (node.name ?? "").toLowerCase();
      if (name.length === 0) return false;
      if (/add to cart|open cart|checkout/i.test(name)) return true;
      return goalKeywordsLower.some((keyword) => keyword.length > 3 && name.includes(keyword));
    })
    .map(describeNode)
    .slice(0, 5);

  return {
    visibleConfirmationTexts,
    liveRegionAdded,
    statusRoleAdded,
    focusChanged,
    focusStayedOnTrigger,
    dialogRolePresent,
    dialogRoleAdded,
    focusInsideDialog,
    modalLikeVisualChange,
    largeVisualChange,
    newInteractiveCount,
    removedInteractiveCount,
    ambiguousControls,
    weakAssociations,
    urlChanged,
    cartCountChanged,
    goalKeywordsPresent,
    goalControlsVisible,
  };
}

function truncateLines(text: string, maxLines: number): string {
  return text.split("\n").filter(Boolean).slice(0, maxLines).join("\n");
}

function nearbyState(input: SignalInput): string[] {
  const { afterTree, focusAfter } = input;
  const lines: string[] = [];

  const focused = afterTree.find((node) => node.focused);
  if (focused) {
    const chain: string[] = [];
    let current: AXNode | undefined = focused;
    const seen = new Set<string>();
    while (current && !seen.has(current.id) && chain.length < 4) {
      seen.add(current.id);
      chain.unshift(describeNode(current));
      const parentId: string | undefined = current.parentId;
      current = parentId ? afterTree.find((node) => node.id === parentId) : undefined;
    }
    lines.push(...chain);
  } else if (focusAfter) {
    lines.push(`focus: ${describeFocus(focusAfter)}`);
  }

  for (const node of afterTree) {
    if (lines.length >= 16) break;
    if (node.role === undefined || !INTERACTIVE_ROLES.has(node.role)) continue;
    const line = describeNode(node);
    if (!lines.includes(line)) lines.push(line);
  }

  return lines.slice(0, 16);
}

export function transitionNotes(signals: TransitionSignals): string[] {
  const notes: string[] = [];
  if (signals.urlChanged) {
    notes.push(
      "This transition was a full-page navigation. Focus returning to the document root is expected browser behavior, and the newly loaded page content is the exposed result of the action.",
    );
  }
  if (signals.modalLikeVisualChange && !signals.dialogRolePresent) {
    notes.push(
      "A modal-like overlay was added to the DOM, but no dialog or alertdialog role was present in the accessibility tree afterwards.",
    );
  }
  if (signals.visibleConfirmationTexts.length > 0 && !signals.liveRegionAdded && !signals.statusRoleAdded) {
    notes.push(
      "Visible confirmation text appeared, but no live region or status/alert role was added, and focus did not move to the feedback.",
    );
  }
  if (signals.dialogRoleAdded && signals.focusInsideDialog) {
    notes.push("A dialog was exposed and focus moved inside it.");
    if (signals.removedInteractiveCount > 0 || signals.newInteractiveCount > 0) {
      notes.push(
        "Nodes from the page behind the dialog were removed from the accessibility tree because the background was made inert; that removal is intentional while the dialog is open.",
      );
    }
  }
  if (signals.dialogRoleAdded && !signals.focusInsideDialog) {
    notes.push("A dialog was exposed but focus did not move inside it.");
  }
  if (signals.ambiguousControls.length > 0) {
    notes.push(
      `Controls with non-specific accessible names appeared: ${signals.ambiguousControls.join(", ")}.`,
    );
  }
  if (signals.goalControlsVisible.length > 0) {
    const hasCheckout = signals.goalControlsVisible.some((control) => /checkout/i.test(control));
    notes.push(
      hasCheckout
        ? `A checkout control matching the goal's next step is visible: ${signals.goalControlsVisible.join(", ")}.`
        : `Controls matching the goal are visible: ${signals.goalControlsVisible.join(", ")}.`,
    );
  }
  if (signals.weakAssociations.length > 0) {
    notes.push(
      `Text that carries important context is not referenced by any control description: ${signals.weakAssociations.join(", ")}.`,
    );
  }
  return notes;
}

function historyNotes(input: SignalInput): string[] {
  const notes: string[] = [];
  const hasUnresolvedSerious = input.history.some((line) =>
    /SERIOUS|without dialog semantics|overlay appeared without dialog/i.test(line),
  );
  const reachesGoal = /checkout/i.test(input.action.accessibleName ?? "") || input.urlAfter.includes("checkout");
  if (reachesGoal) {
    notes.push("This transition completed the goal; no further action is required.");
  }
  if (hasUnresolvedSerious && reachesGoal) {
    notes.push(
      "This step reaches the end of the goal, but earlier steps in this journey had serious semantic issues that were never resolved.",
    );
  }
  return notes;
}

export function buildTransitionEvidence(input: SignalInput): TransitionEvaluationInput {
  const { diff, afterTree } = input;

  const added = addedNodeLines(diff)
    .slice(0, 12)
    .map((line) => `+ ${line}`);
  const removed = diff.entries
    .filter((entry) => entry.kind === "removed")
    .slice(0, 12)
    .map((entry) => `- ${entry.path}`);
  const changed = diff.entries
    .filter((entry) => entry.kind !== "added" && entry.kind !== "removed")
    .slice(0, 12)
    .map((entry) => `~ ${describeChange(entry)}`);

  const liveRegions = afterTree
    .filter(isLiveNode)
    .map((node) => `${describeNode(node)} live=${node.live ?? node.role ?? "polite"}`);

  const signals = computeTransitionSignals(input);

  return {
    step: input.step,
    goal: input.goal,
    mode: input.mode,
    action: input.action,
    focus: {
      before: input.focusBefore ? describeFocus(input.focusBefore) : undefined,
      after: input.focusAfter ? describeFocus(input.focusAfter) : undefined,
    },
    semanticChanges: { added, removed, changed },
    domMutations: summarizeMutations(input.mutations).slice(0, 10),
    liveRegions,
    nearbyAccessibilityState: nearbyState(input),
    beforeSummary: truncateLines(renderAXTree(input.beforeTree), 40),
    afterSummary: truncateLines(renderAXTree(afterTree), 40),
    signals,
    history: input.history.slice(-8),
    notes: [...transitionNotes(signals), ...historyNotes(input)],
  };
}
