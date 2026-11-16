import type { Page } from "playwright";
import type { MutationSummary } from "@/types/accessibility";

type FocusEventSummary = { type: string; role?: string; name?: string };

/**
 * Install the DOM mutation + focus tracker. Uses a single init script so it
 * survives navigations; all browser logic is inlined (no closures over Node
 * values). Best effort: failures are swallowed.
 */
export async function installMutationObserver(page: Page): Promise<void> {
  try {
    await page.addInitScript(() => {
      const win = window as unknown as {
        __sjMutations?: MutationSummary[];
        __sjFocusEvents?: FocusEventSummary[];
        __sjObserverAttached?: boolean;
      };
      if (!win.__sjMutations) win.__sjMutations = [];
      if (!win.__sjFocusEvents) win.__sjFocusEvents = [];

      const MAX_MUTATIONS = 300;
      const MAX_FOCUS = 100;
      const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);
      // The analyzer draws a cursor/highlight overlay into the page. It is
      // presentation only and must never appear as captured evidence.
      const isOverlayNode = (element: Element): boolean => {
        if (element.hasAttribute("data-sj-overlay")) return true;
        const closest = element.closest?.("[data-sj-overlay]");
        return closest != null;
      };
      const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/;

      const truncate = (value: string | null | undefined, max: number): string | undefined => {
        if (value == null) return undefined;
        const text = String(value);
        return text.length > max ? text.slice(0, max) : text;
      };

      const pushMutation = (mutation: MutationSummary): void => {
        const list = win.__sjMutations;
        if (!list) return;
        if (list.length >= MAX_MUTATIONS) list.shift();
        list.push(mutation);
      };

      const attrsOf = (element: Element): Record<string, string> => {
        const attributes: Record<string, string> = {};
        for (const name of ["class", "role", "aria-live", "aria-label", "aria-modal", "hidden"]) {
          const value = element.getAttribute(name);
          if (value != null) attributes[name] = truncate(value, 120) ?? "";
        }
        return attributes;
      };

      const describeElement = (
        element: Element,
      ): { tag: string; text?: string; attributes?: Record<string, string> } => {
        const tag = element.tagName ? element.tagName.toLowerCase() : "node";
        const result: { tag: string; text?: string; attributes?: Record<string, string> } = {
          tag,
        };
        const text = truncate(element.textContent?.replace(/\s+/g, " ").trim(), 80);
        if (text) result.text = text;
        const attributes = attrsOf(element);
        if (Object.keys(attributes).length > 0) result.attributes = attributes;
        return result;
      };

      const roleOf = (element: Element): string => {
        const explicit = element.getAttribute("role")?.trim();
        if (explicit) return explicit;
        const tag = element.tagName ? element.tagName.toLowerCase() : "";
        if (tag === "a") return "link";
        if (tag === "button") return "button";
        if (tag === "select") return "combobox";
        if (tag === "textarea") return "textbox";
        if (tag === "dialog") return "dialog";
        if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
          return "heading";
        }
        if (tag === "input") {
          const type = (element.getAttribute("type") ?? "text").toLowerCase();
          if (type === "checkbox") return "checkbox";
          if (type === "radio") return "radio";
          if (type === "search") return "searchbox";
          if (type === "button" || type === "submit" || type === "reset") return "button";
          if (type === "range") return "slider";
          if (type === "number") return "spinbutton";
          return "textbox";
        }
        if (tag === "body" || tag === "html") return tag;
        return "generic";
      };

      const nameOf = (element: Element): string | undefined => {
        const ariaLabel = element.getAttribute("aria-label")?.trim();
        if (ariaLabel) return ariaLabel;
        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => (id ? document.getElementById(id)?.textContent?.trim() ?? "" : ""))
            .filter(Boolean)
            .join(" ")
            .trim();
          if (text) return text;
        }
        const alt = element.getAttribute("alt")?.trim();
        if (alt) return alt;
        const text = (element.textContent ?? "").trim();
        return text ? text.slice(0, 120) : undefined;
      };

      const handleRecords = (records: MutationRecord[]): void => {
        for (const record of records) {
          if (record.type === "childList") {
            for (const node of Array.from(record.addedNodes)) {
              if (node.nodeType === 1) {
                const element = node as Element;
                if (SKIP_TAGS.has(element.tagName) || isOverlayNode(element)) continue;
                pushMutation({ type: "element_added", ...describeElement(element) });
              } else if (node.nodeType === 3) {
                const text = truncate(node.textContent?.trim(), 120);
                if (text) pushMutation({ type: "text_changed", text: `"${text}"` });
              }
            }
            for (const node of Array.from(record.removedNodes)) {
              if (node.nodeType !== 1) continue;
              const element = node as Element;
              if (SKIP_TAGS.has(element.tagName) || isOverlayNode(element)) continue;
              pushMutation({ type: "element_removed", ...describeElement(element) });
            }
          } else if (record.type === "characterData") {
            const parent = record.target.parentElement;
            if (parent && isOverlayNode(parent)) continue;
            const text = truncate(record.target.textContent?.trim(), 120);
            if (!text) continue;
            const oldText = truncate(record.oldValue?.trim(), 120);
            pushMutation({
              type: "text_changed",
              text: oldText ? `"${oldText}" → "${text}"` : `"${text}"`,
            });
          } else if (record.type === "attributes") {
            const element = record.target as Element;
            const name = record.attributeName;
            if (!name || !element.tagName || SKIP_TAGS.has(element.tagName) || isOverlayNode(element)) continue;
            const tag = element.tagName.toLowerCase();
            const rawValue = element.getAttribute(name);
            const newValue = rawValue ?? "";
            const oldValue = record.oldValue ?? "";
            if (newValue === oldValue) continue;
            if (
              name === "class" ||
              name === "role" ||
              name.startsWith("aria-") ||
              name === "disabled" ||
              name === "hidden"
            ) {
              pushMutation({
                type: "attribute_changed",
                tag,
                attributes: { [name]: truncate(newValue, 120) ?? "" },
              });
              if (name === "hidden") {
                pushMutation({
                  type: "visibility_changed",
                  tag,
                  visibility: rawValue !== null ? "hidden" : "visible",
                });
              }
            } else if (name === "style" && HIDDEN_STYLE.test(newValue) !== HIDDEN_STYLE.test(oldValue)) {
              pushMutation({
                type: "visibility_changed",
                tag,
                visibility: HIDDEN_STYLE.test(newValue) ? "hidden" : "visible",
                attributes: { style: truncate(newValue, 120) ?? "" },
              });
            }
          }
        }
      };

      const startObserver = (): void => {
        if (win.__sjObserverAttached) return;
        const target = document.documentElement;
        if (!target) return;
        win.__sjObserverAttached = true;
        const observer = new MutationObserver(handleRecords);
        observer.observe(target, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
          characterDataOldValue: true,
          attributeOldValue: true,
        });
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver, { once: true });
      } else {
        startObserver();
      }

      const recordFocus = (type: string, target: EventTarget | null): void => {
        if (!(target instanceof Element)) return;
        const list = win.__sjFocusEvents;
        if (!list) return;
        const event: FocusEventSummary = { type, role: roleOf(target) };
        const name = nameOf(target);
        if (name) event.name = name;
        if (list.length >= MAX_FOCUS) list.shift();
        list.push(event);
      };

      document.addEventListener("focusin", (event) => recordFocus("focusin", event.target), true);
      document.addEventListener("focusout", (event) => recordFocus("focusout", event.target), true);
    });
  } catch {
    // tracking is best effort
  }
}

/** Read and clear captured mutations; tolerates a missing tracker. */
export async function readMutations(page: Page): Promise<MutationSummary[]> {
  try {
    return await page.evaluate(() => {
      const win = window as unknown as { __sjMutations?: MutationSummary[] };
      const mutations = win.__sjMutations ?? [];
      win.__sjMutations = [];
      return mutations;
    });
  } catch {
    return [];
  }
}

/** Read and clear captured focus events; tolerates a missing tracker. */
export async function readFocusEvents(page: Page): Promise<FocusEventSummary[]> {
  try {
    return await page.evaluate(() => {
      const win = window as unknown as { __sjFocusEvents?: FocusEventSummary[] };
      const events = win.__sjFocusEvents ?? [];
      win.__sjFocusEvents = [];
      return events;
    });
  } catch {
    return [];
  }
}

function describeTarget(mutation: MutationSummary): string {
  const tag = mutation.tag ?? "element";
  const firstClass = mutation.attributes?.class?.split(/\s+/).filter(Boolean)[0];
  return firstClass ? `${tag}.${firstClass}` : tag;
}

function isToastLike(mutation: MutationSummary): boolean {
  if (mutation.type !== "element_added") return false;
  const role = mutation.attributes?.role ?? "";
  if (role === "alert" || role === "status") return true;
  if (mutation.attributes?.["aria-live"]) return true;
  return /toast|notification|alert|snackbar|banner|status/i.test(mutation.attributes?.class ?? "");
}

/** Human readable mutation lines, deduped and capped at 20. */
export function summarizeMutations(mutations: MutationSummary[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (line: string): void => {
    if (lines.length >= 20 || seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  };

  for (const mutation of mutations) {
    switch (mutation.type) {
      case "element_added": {
        const target = describeTarget(mutation);
        if (isToastLike(mutation)) add(`Visible toast added: ${mutation.text ?? target}`);
        else add(`Element added: ${target}`);
        break;
      }
      case "element_removed":
        add(`Element removed: ${describeTarget(mutation)}`);
        break;
      case "text_changed":
        add(`Text changed: ${mutation.text ?? ""}`.trim());
        break;
      case "attribute_changed": {
        const entry = Object.entries(mutation.attributes ?? {})[0];
        if (!entry) {
          add(`Attribute changed: ${describeTarget(mutation)}`);
          break;
        }
        add(`Attribute changed: ${entry[0]}="${entry[1]}" on ${describeTarget(mutation)}`);
        break;
      }
      case "visibility_changed":
        add(
          `Visibility: ${mutation.visibility === "hidden" ? "visible → hidden" : "hidden → visible"}`,
        );
        break;
    }
  }
  return lines;
}

function isOverlay(mutation: MutationSummary): boolean {
  const role = mutation.attributes?.role ?? "";
  if (role === "dialog") return true;
  return /modal|overlay|dialog|drawer|sheet/i.test(mutation.attributes?.class ?? "");
}

/** One short sentence describing the visible outcome of a mutation batch. */
export function describeVisualChange(mutations: MutationSummary[], urlChanged: boolean): string {
  if (urlChanged) return "Page navigated";
  if (mutations.length === 0) return "No visible change detected";

  const added = mutations.filter((mutation) => mutation.type === "element_added");
  const removed = mutations.filter((mutation) => mutation.type === "element_removed");

  if (added.some(isOverlay)) return "Overlay appeared";
  if (removed.some(isOverlay)) return "Overlay closed";

  const addedText = added.map((mutation) => mutation.text ?? "").join(" ");
  if (/added|success|saved|confirmed|complete/i.test(addedText) || added.some(isToastLike)) {
    return "Confirmation message appeared";
  }
  if (mutations.some((mutation) => mutation.type === "text_changed")) return "Content updated";
  if (added.length > 0) return "Content appeared";
  if (removed.length > 0) return "Content removed";
  if (mutations.some((mutation) => mutation.type === "visibility_changed")) {
    return "Content visibility changed";
  }
  return "Page content updated";
}
