/**
 * Accessibility representation types.
 *
 * These mirror the subset of Chromium's accessibility tree (CDP
 * `Accessibility.getFullAXTree`) that Semantic Journey actually uses.
 * Everything downstream (normalization, diffing, candidate building,
 * Jev evidence) speaks this shape.
 */

export type AXNode = {
  id: string;
  role?: string;
  name?: string;
  description?: string;

  value?: string;

  focused?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean | "mixed";
  required?: boolean;
  invalid?: boolean;

  level?: number;

  live?: string;
  relevant?: string;
  atomic?: boolean;

  haspopup?: string;

  parentId?: string;
  childIds?: string[];

  ignored?: boolean;
};

export type FocusSnapshot = {
  role?: string;
  name?: string;
  selector?: string;
  tag?: string;
};

export type MutationSummary = {
  type:
    | "element_added"
    | "element_removed"
    | "text_changed"
    | "attribute_changed"
    | "visibility_changed";
  tag?: string;
  text?: string;
  attributes?: Record<string, string>;
  visibility?: "visible" | "hidden";
};

export type AxeNodeFinding = {
  target: string[];
  html: string;
  failureSummary?: string;
};

export type AxeFinding = {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNodeFinding[];
};

export type AxeSummary = {
  findings: AxeFinding[];
  violationCount: number;
  passCount: number;
  incompleteCount: number;
  timestamp: string;
};

export type AXDiffKind =
  | "added"
  | "removed"
  | "changed"
  | "focus_changed"
  | "state_changed"
  | "name_changed"
  | "role_changed"
  | "live_region_changed";

export type AXTreeDiffEntry = {
  kind: AXDiffKind;
  /** Human readable path, e.g. `button "Add to cart"` */
  path: string;
  before?: string;
  after?: string;
  node?: AXNode;
  fields?: string[];
};

export type AXTreeDiff = {
  entries: AXTreeDiffEntry[];
  added: number;
  removed: number;
  changed: number;
  focusChanged: boolean;
  liveRegionsAdded: string[];
};

/** Compact evidence extracted from a normalized tree. */
export type TreeEvidence = {
  /** One line per meaningful node, indented. */
  lines: string[];
  /** Compact one-line summaries of interactive nodes. */
  interactive: string[];
  focused: AXNode | null;
  liveRegions: string[];
  dialogs: string[];
  headings: string[];
  /** Truncated summary string suitable for a model prompt. */
  summary: string;
};
