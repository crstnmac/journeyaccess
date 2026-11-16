import type { CDPSession, Page } from "playwright";
import type { AXNode } from "@/types/accessibility";

type CdpAxValue = { type?: string; value?: unknown };
type CdpAxProperty = { name?: string; value?: CdpAxValue };
type CdpAxNode = {
  nodeId?: string;
  ignored?: boolean;
  role?: CdpAxValue;
  name?: CdpAxValue;
  description?: CdpAxValue;
  value?: CdpAxValue;
  parentId?: string;
  childIds?: string[];
  properties?: CdpAxProperty[];
};

const DISPLAY_ROLES: Record<string, string> = {
  StaticText: "text",
  InlineTextBox: "text",
};

/** Display name for a role, e.g. `StaticText` renders as `text`. */
export function displayRole(role: string | undefined): string {
  if (!role) return "node";
  return DISPLAY_ROLES[role] ?? role;
}

/** Compact one-line description of a node: `button "Add to cart"`. */
export function describeNode(node: AXNode): string {
  const role = displayRole(node.role);
  const name = node.name?.trim();
  return name ? `${role} "${name}"` : role;
}

/** Full one-line rendering including state annotations. */
export function axNodeToLine(node: AXNode): string {
  const parts: string[] = [displayRole(node.role)];
  if (node.name && node.name.trim().length > 0) parts.push(`"${node.name}"`);
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
  return parts.join(" ");
}

function stringValue(value: CdpAxValue | undefined): string | undefined {
  return typeof value?.value === "string" ? value.value : undefined;
}

function boolValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function applyProperty(node: AXNode, property: CdpAxProperty): void {
  const name = property.name;
  if (!name) return;
  const raw = property.value?.value;
  switch (name) {
    case "focused": {
      const value = boolValue(raw);
      if (value !== undefined) node.focused = value;
      break;
    }
    case "disabled": {
      const value = boolValue(raw);
      if (value !== undefined) node.disabled = value;
      break;
    }
    case "expanded": {
      const value = boolValue(raw);
      if (value !== undefined) node.expanded = value;
      break;
    }
    case "selected": {
      const value = boolValue(raw);
      if (value !== undefined) node.selected = value;
      break;
    }
    case "required": {
      const value = boolValue(raw);
      if (value !== undefined) node.required = value;
      break;
    }
    case "invalid": {
      const value = boolValue(raw);
      if (value !== undefined) node.invalid = value;
      break;
    }
    case "level":
      if (typeof raw === "number") node.level = raw;
      break;
    case "live":
      if (typeof raw === "string") node.live = raw;
      break;
    case "relevant":
      if (typeof raw === "string") node.relevant = raw;
      break;
    case "atomic": {
      const value = boolValue(raw);
      if (value !== undefined) node.atomic = value;
      break;
    }
    case "hasPopup":
    case "haspopup":
      if (typeof raw === "string") node.haspopup = raw;
      break;
    case "checked":
      if (raw === "mixed") node.checked = "mixed";
      else {
        const value = boolValue(raw);
        if (value !== undefined) node.checked = value;
      }
      break;
  }
}

function mapCdpNode(node: CdpAxNode): AXNode | null {
  if (typeof node.nodeId !== "string" || node.nodeId.length === 0) return null;
  const mapped: AXNode = { id: node.nodeId };
  const role = stringValue(node.role);
  if (role !== undefined) mapped.role = role;
  const name = stringValue(node.name);
  if (name !== undefined) mapped.name = name;
  const description = stringValue(node.description);
  if (description !== undefined) mapped.description = description;
  const value = node.value?.value;
  if (typeof value === "string") mapped.value = value;
  else if (typeof value === "number") mapped.value = String(value);
  if (typeof node.parentId === "string") mapped.parentId = node.parentId;
  if (Array.isArray(node.childIds)) {
    mapped.childIds = node.childIds.filter((id): id is string => typeof id === "string");
  }
  if (typeof node.ignored === "boolean") mapped.ignored = node.ignored;
  for (const property of node.properties ?? []) applyProperty(mapped, property);
  // Chrome flags RootWebArea/document as focused whenever the document has
  // focus. That is document focus, not element focus, so drop it.
  if (mapped.role === "RootWebArea" || mapped.role === "document" || mapped.role === "webarea") {
    delete mapped.focused;
  }
  return mapped;
}

function extractNodes(result: unknown): AXNode[] | null {
  if (typeof result !== "object" || result === null) return null;
  const nodes = (result as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return null;
  return nodes
    .map((node) => mapCdpNode(node as CdpAxNode))
    .filter((node): node is AXNode => node !== null);
}

async function captureFromCdp(page: Page): Promise<AXNode[] | null> {
  let session: CDPSession | null = null;
  try {
    session = await page.context().newCDPSession(page);
    await session.send("Accessibility.enable");
    const result: unknown = await session.send("Accessibility.getFullAXTree");
    return extractNodes(result);
  } catch {
    return null;
  } finally {
    if (session) {
      try {
        await session.detach();
      } catch {
        // session may already be gone
      }
    }
  }
}

type PlaywrightAxNode = {
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  children?: PlaywrightAxNode[];
};

type AccessibilityLike = {
  snapshot?: () => Promise<PlaywrightAxNode | null>;
};

async function captureFromPlaywright(page: Page): Promise<AXNode[] | null> {
  try {
    const accessibility = (page as unknown as { accessibility?: AccessibilityLike })
      .accessibility;
    const snapshot = await accessibility?.snapshot?.();
    if (!snapshot) return null;
    const nodes: AXNode[] = [];
    let counter = 0;
    const walk = (raw: PlaywrightAxNode, parentId?: string): AXNode => {
      const node: AXNode = { id: `pw-${counter++}` };
      if (typeof raw.role === "string" && raw.role.length > 0) node.role = raw.role;
      if (typeof raw.name === "string" && raw.name.length > 0) node.name = raw.name;
      if (typeof raw.value === "string" && raw.value.length > 0) node.value = raw.value;
      if (typeof raw.description === "string" && raw.description.length > 0) {
        node.description = raw.description;
      }
      if (parentId) node.parentId = parentId;
      nodes.push(node);
      const childIds: string[] = [];
      for (const child of raw.children ?? []) {
        childIds.push(walk(child, node.id).id);
      }
      if (childIds.length > 0) node.childIds = childIds;
      return node;
    };
    walk(snapshot);
    return nodes;
  } catch {
    return null;
  }
}

/**
 * Capture the full accessibility tree. Tries the Chromium DevTools Protocol
 * first, then Playwright's legacy snapshot API, then gives up with `[]`.
 * Never throws.
 */
export async function captureAXTree(page: Page): Promise<AXNode[]> {
  const fromCdp = await captureFromCdp(page);
  if (fromCdp) return fromCdp;
  const fromPlaywright = await captureFromPlaywright(page);
  if (fromPlaywright) return fromPlaywright;
  return [];
}
