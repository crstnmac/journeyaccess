import type { AXNode } from "@/types/accessibility";
import type { CandidateAction } from "@/types/journey";

/**
 * Accessible names that must never be executed autonomously.
 * Note: "checkout", "cart", "add to cart" and "continue to checkout" are safe.
 */
const DESTRUCTIVE_PATTERN =
  /\b(delete|remove|purchase|buy|pay|payment|send|upload|log ?out|sign ?out|unsubscribe|password|deactivate|terminate|destroy|drop|clear all|reset)\b/i;

const ALLOWED_ROLES = new Set([
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

/** Deterministic priority; everything not listed keeps document order after these. */
const ROLE_ORDER = [
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
];

const ACTION_BY_ROLE: Record<string, CandidateAction["action"]> = {
  checkbox: "check",
  radio: "check",
  switch: "check",
  combobox: "select",
};

/**
 * Demo harness controls that must never be part of the analyzed action space.
 * The mode switcher belongs to the Semantic Journey harness, not to Orbit
 * Store, and clicking it mid-journey would invalidate the run.
 */
const HARNESS_CONTROL_PATTERN = /^(broken|fixed) experience$/i;

export function isHarnessControl(name: string): boolean {
  return HARNESS_CONTROL_PATTERN.test(name.trim());
}

export function isDestructive(name: string): boolean {
  return DESTRUCTIVE_PATTERN.test(name);
}

export function buildCandidates(
  nodes: AXNode[],
  options: { limit?: number } = {},
): CandidateAction[] {
  const limit = options.limit ?? 12;
  const candidates: CandidateAction[] = [];
  const occurrences = new Map<string, number>();

  for (const node of nodes) {
    const role = node.role?.toLowerCase().trim();
    if (!role || !ALLOWED_ROLES.has(role)) continue;
    if (node.ignored) continue;

    const name = node.name?.replace(/\s+/g, " ").trim();
    if (!name) continue;

    // Occurrence index counts every same-named node, including skipped ones,
    // so `.nth(occurrence)` keeps pointing at the same document position.
    const key = `${role}|${name}`;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);

    if (node.disabled) continue;
    // Destructive controls are marked but never returned: they must never be executable.
    if (isDestructive(name)) continue;
    // Analyzer harness controls (the demo mode switcher) are not part of the app.
    if (isHarnessControl(name)) continue;

    candidates.push({
      id: `action_${candidates.length + 1}`,
      action: ACTION_BY_ROLE[role] ?? "click",
      role,
      accessibleName: name,
      occurrence,
    });
  }

  const sorted = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const orderA = ROLE_ORDER.indexOf(a.candidate.role);
      const orderB = ROLE_ORDER.indexOf(b.candidate.role);
      const rankA = orderA === -1 ? ROLE_ORDER.length : orderA;
      const rankB = orderB === -1 ? ROLE_ORDER.length : orderB;
      return rankA - rankB || a.index - b.index;
    })
    .map((entry) => entry.candidate);

  return sorted.slice(0, limit);
}

const VERB_BY_ACTION: Record<CandidateAction["action"], string> = {
  click: "Activate",
  focus: "Focus",
  check: "Check",
  select: "Select",
};

export function describeCandidate(candidate: CandidateAction): string {
  return `${VERB_BY_ACTION[candidate.action]} ${candidate.role} "${candidate.accessibleName}"`;
}
