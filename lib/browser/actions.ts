import type { Locator, Page } from "playwright";
import type { CandidateAction, SemanticAction } from "@/types/journey";
import { isDestructive } from "./candidates";
import { JOURNEY_LIMITS } from "./runner";

/** Playwright 1.63 does not export `AriaRole`; derive the exact role union instead. */
type AriaRole = Parameters<Page["getByRole"]>[0];

/**
 * Resolve a candidate strictly through accessible role/name locators.
 * Falls back to a non-exact name match when the exact name finds nothing,
 * then to `.nth(occurrence)` for duplicates.
 */
async function resolveLocator(page: Page, candidate: CandidateAction): Promise<Locator> {
  const role = candidate.role as AriaRole;
  const exactLocator = page.getByRole(role, { name: candidate.accessibleName, exact: true });
  const exactCount = await exactLocator.count();
  if (candidate.occurrence < exactCount) return exactLocator.nth(candidate.occurrence);

  const fuzzyLocator = page.getByRole(role, { name: candidate.accessibleName, exact: false });
  const fuzzyCount = await fuzzyLocator.count();
  if (candidate.occurrence < fuzzyCount) return fuzzyLocator.nth(candidate.occurrence);

  if (exactCount === 0 && fuzzyCount === 0) {
    throw new Error(
      `No accessible ${candidate.role} named "${candidate.accessibleName}" found on the page`,
    );
  }
  throw new Error(
    `Accessible ${candidate.role} "${candidate.accessibleName}" occurrence ${candidate.occurrence} is out of range (${Math.max(exactCount, fuzzyCount)} found)`,
  );
}

async function selectWithFallback(locator: Locator, candidate: CandidateAction): Promise<void> {
  try {
    await locator.click({ timeout: 10_000 });
    return;
  } catch (error) {
    if (candidate.role !== "combobox") throw error;
    // Native <select> fallback, still through the locator API (never raw selectors).
    const tagName = await locator.evaluate((element) => element.tagName.toLowerCase()).catch(() => "");
    if (tagName !== "select") throw error;
    await locator.selectOption({ label: candidate.accessibleName }, { timeout: 10_000 });
  }
}

/**
 * Draw a presentation-only cursor + ring over the target so a live viewer can
 * see what the agent is about to act on. The overlay is marked
 * `data-sj-overlay` and `aria-hidden`, so it never enters the accessibility
 * tree or the captured mutation evidence.
 */
export async function highlightTarget(
  page: Page,
  candidate: CandidateAction,
  durationMs = 450,
): Promise<void> {
  try {
    const locator = await resolveLocator(page, candidate);
    const box = await locator.boundingBox({ timeout: 2000 });
    if (!box) return;
    await page.evaluate(
      ({ x, y, width, height }) => {
        document.getElementById("__sj-overlay")?.remove();
        const container = document.createElement("div");
        container.id = "__sj-overlay";
        container.setAttribute("data-sj-overlay", "true");
        container.setAttribute("aria-hidden", "true");
        container.setAttribute("role", "presentation");
        container.style.cssText =
          "position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:strict;";
        const ring = document.createElement("div");
        ring.style.cssText = [
          "position:absolute",
          `left:${x - 4}px`,
          `top:${y - 4}px`,
          `width:${width + 8}px`,
          `height:${height + 8}px`,
          "border:2px solid rgba(37,99,235,0.95)",
          "border-radius:8px",
          "box-shadow:0 0 0 4px rgba(59,130,246,0.18)",
        ].join(";");
        const dot = document.createElement("div");
        dot.style.cssText = [
          "position:absolute",
          `left:${x + width / 2 - 7}px`,
          `top:${y + height / 2 - 7}px`,
          "width:14px",
          "height:14px",
          "border-radius:9999px",
          "background:rgba(37,99,235,0.95)",
          "box-shadow:0 0 0 6px rgba(59,130,246,0.22)",
        ].join(";");
        container.append(ring, dot);
        document.documentElement.appendChild(container);
      },
      { x: box.x, y: box.y, width: box.width, height: box.height },
    );
    await page.waitForTimeout(durationMs);
  } catch {
    // Highlighting is presentation only; never block the journey.
  }
}

export async function clearHighlight(page: Page): Promise<void> {
  try {
    await page.evaluate(() => document.getElementById("__sj-overlay")?.remove());
  } catch {
    // ignore
  }
}

export async function executeCandidate(page: Page, candidate: CandidateAction): Promise<void> {
  if (candidate.destructive || isDestructive(candidate.accessibleName)) {
    throw new Error("Refused destructive action: " + candidate.accessibleName);
  }

  const locator = await resolveLocator(page, candidate);
  await highlightTarget(page, candidate);

  try {
    switch (candidate.action) {
      case "focus":
        await locator.focus();
        break;
      case "check":
        await locator.check({ timeout: 10_000 });
        break;
      case "select":
        await selectWithFallback(locator, candidate);
        break;
      case "click":
      default:
        await locator.click({ timeout: 10_000 });
        break;
    }
  } finally {
    await clearHighlight(page);
  }

  await waitForStability(page);
}

export async function waitForStability(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(JOURNEY_LIMITS.settleMs);
}

export function describeAction(candidate: CandidateAction): SemanticAction {
  const type: SemanticAction["type"] =
    candidate.action === "focus" ? "focus" : candidate.action === "select" ? "select" : "click";
  return {
    type,
    role: candidate.role,
    accessibleName: candidate.accessibleName,
  };
}
