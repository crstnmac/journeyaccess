import type { Page } from "playwright";
import type { AXNode, FocusSnapshot } from "@/types/accessibility";

type DomFocusSnapshot = {
  role: string;
  name?: string;
  selector: string;
  tag: string;
};

/**
 * Snapshot the focused element from the DOM. Returns null only when there is
 * truly no active element (or the evaluation itself fails).
 */
export async function captureFocus(page: Page): Promise<FocusSnapshot | null> {
  try {
    return await page.evaluate((): DomFocusSnapshot | null => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return null;

      const tag = active.tagName ? active.tagName.toLowerCase() : "";

      const roleFromTag = (tagName: string, inputType: string): string | undefined => {
        switch (tagName) {
          case "a":
            return "link";
          case "button":
            return "button";
          case "select":
            return "combobox";
          case "textarea":
            return "textbox";
          case "dialog":
            return "dialog";
          case "h1":
          case "h2":
          case "h3":
          case "h4":
          case "h5":
          case "h6":
            return "heading";
          case "input": {
            const type = (inputType || "text").toLowerCase();
            if (type === "checkbox") return "checkbox";
            if (type === "radio") return "radio";
            if (type === "search") return "searchbox";
            if (type === "button" || type === "submit" || type === "reset" || type === "image") {
              return "button";
            }
            if (type === "range") return "slider";
            if (type === "number") return "spinbutton";
            if (type === "hidden") return undefined;
            return "textbox";
          }
          default:
            return undefined;
        }
      };

      const explicitRole = active.getAttribute("role")?.trim();
      let role: string | undefined =
        explicitRole && explicitRole.length > 0 ? explicitRole : undefined;
      if (!role) role = roleFromTag(tag, (active as HTMLInputElement).type);
      if (!role && (tag === "body" || tag === "html")) role = tag;
      if (!role) {
        let parent = active.parentElement;
        while (parent) {
          const parentRole = parent.getAttribute("role")?.trim();
          if (parentRole && parentRole.length > 0) {
            role = parentRole;
            break;
          }
          parent = parent.parentElement;
        }
      }
      if (!role) role = "generic";

      let name: string | undefined;
      const ariaLabel = active.getAttribute("aria-label")?.trim();
      if (ariaLabel) name = ariaLabel;

      if (!name) {
        const labelledBy = active.getAttribute("aria-labelledby");
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => (id ? document.getElementById(id)?.textContent?.trim() ?? "" : ""))
            .filter(Boolean)
            .join(" ")
            .trim();
          if (text) name = text;
        }
      }

      if (!name && active.id) {
        const escaped =
          typeof CSS !== "undefined" && typeof CSS.escape === "function"
            ? CSS.escape(active.id)
            : active.id.replace(/["\\]/g, "\\$&");
        const label = document.querySelector(`label[for="${escaped}"]`);
        const text = label?.textContent?.trim();
        if (text) name = text;
      }

      if (!name) {
        const labels = (active as HTMLInputElement).labels;
        const text = labels && labels.length > 0 ? labels[0]?.textContent?.trim() : undefined;
        if (text) name = text;
      }

      if (!name) {
        const alt = active.getAttribute("alt")?.trim();
        if (alt) name = alt;
      }

      // The document root has no meaningful accessible name; using its text
      // content would dump the whole page into the focus snapshot.
      if (!name && tag !== "body" && tag !== "html") {
        const text = (active.textContent ?? "").trim();
        if (text) name = text.slice(0, 80);
      }

      const buildSelector = (element: Element): string => {
        const parts: string[] = [];
        if (element.id) {
          parts.push(`#${element.id}`);
        } else {
          let current: Element | null = element;
          let depth = 0;
          while (
            current &&
            current.nodeType === 1 &&
            current !== document.documentElement &&
            depth < 4
          ) {
            let part = current.tagName.toLowerCase();
            const parent: Element | null = current.parentElement;
            if (parent) {
              let index = 1;
              let sibling: Element | null = current.previousElementSibling;
              while (sibling) {
                if (sibling.tagName === current.tagName) index += 1;
                sibling = sibling.previousElementSibling;
              }
              part += `:nth-of-type(${index})`;
            }
            parts.unshift(part);
            if (current.id) {
              parts[0] = `#${current.id}`;
              break;
            }
            current = parent;
            depth += 1;
          }
        }
        let selector = parts.join(" > ");
        const label = element.getAttribute("aria-label");
        if (label) selector += `[aria-label="${label.replace(/"/g, '\\"')}"]`;
        return selector || element.tagName.toLowerCase();
      };

      const snapshot: DomFocusSnapshot = { role, selector: buildSelector(active), tag };
      if (name) snapshot.name = name;
      return snapshot;
    });
  } catch {
    return null;
  }
}

const ROOT_ROLES = new Set(["RootWebArea", "document", "webarea"]);

/** Derive the focused node from a normalized AX tree. */
export function focusFromAXTree(nodes: AXNode[]): FocusSnapshot | null {
  const focused =
    nodes.find((node) => node.focused && !ROOT_ROLES.has(node.role ?? "")) ??
    nodes.find((node) => node.focused);
  if (!focused) return null;
  const snapshot: FocusSnapshot = {};
  if (focused.role) snapshot.role = focused.role;
  if (focused.name) snapshot.name = focused.name;
  return snapshot;
}

/** Prefer DOM-derived fields, fill gaps from the AX tree. */
export function mergeFocus(
  dom: FocusSnapshot | null,
  ax: FocusSnapshot | null,
): FocusSnapshot | null {
  if (!dom) return ax;
  if (!ax) return dom;
  const merged: FocusSnapshot = { ...dom };
  if (!merged.role && ax.role) merged.role = ax.role;
  if (!merged.name && ax.name) merged.name = ax.name;
  return merged;
}

/** `button "Add to cart"` or `none`. */
export function describeFocus(focus: FocusSnapshot | null): string {
  if (!focus) return "none";
  const role = focus.role ?? "generic";
  const name = focus.name?.trim();
  return name ? `${role} "${name}"` : role;
}
