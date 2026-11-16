import { expect, request, test } from "@playwright/test";

import type { JourneyReport } from "../../types/analysis";
import type { JourneyStep } from "../../types/journey";

const BASE = "http://127.0.0.1:3100";
const GOAL =
  "Find Wireless Headphones, add them to the cart, open the cart, and continue toward checkout.";

let broken: JourneyReport;
let fixed: JourneyReport;

function stepNamed(report: JourneyReport, pattern: RegExp): JourneyStep {
  const step = report.steps.find((entry) => pattern.test(entry.action.accessibleName ?? ""));
  expect(step, `expected a step whose action matches ${pattern}`).toBeTruthy();
  return step as JourneyStep;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const api = await request.newContext({ baseURL: BASE });
  try {
    const brokenResponse = await api.post("/api/analyze", {
      data: { url: `${BASE}/demo-shop?mode=broken`, goal: GOAL },
      timeout: 240_000,
    });
    expect(brokenResponse.ok()).toBeTruthy();
    broken = (await brokenResponse.json()) as JourneyReport;

    const fixedResponse = await api.post("/api/analyze", {
      data: { url: `${BASE}/demo-shop?mode=fixed`, goal: GOAL },
      timeout: 240_000,
    });
    expect(fixedResponse.ok()).toBeTruthy();
    fixed = (await fixedResponse.json()) as JourneyReport;
  } finally {
    await api.dispose();
  }
});

test("1. broken add to cart produces a semantic feedback warning", () => {
  const step = stepNamed(broken, /add to cart/i);
  expect(step.result).toBe("FRICTION");
  const feedback = step.evaluation.findings.find((finding) => finding.category === "feedback");
  expect(feedback).toBeTruthy();
  expect(feedback?.title).toMatch(/unannounced action feedback/i);
  expect(feedback?.confidence).toBeGreaterThan(0.9);
  expect(step.evaluation.judgments.feedback_exposed.value).toBe(false);
  expect(step.transition.mutations.some((mutation) => /toast|added to cart/i.test(mutation.text ?? mutation.attributes?.class ?? ""))).toBe(true);
});

test("2. fixed add to cart produces no feedback warning", () => {
  const step = stepNamed(fixed, /add to cart/i);
  expect(step.result).toBe("PASS");
  expect(step.evaluation.findings.some((finding) => finding.category === "feedback")).toBe(false);
  expect(step.evaluation.judgments.feedback_exposed.value).toBe(true);
  expect(step.evaluation.judgments.impact.value).toBe("none");
});

test("3. broken cart modal detects wrong focus and missing dialog semantics", () => {
  const step = stepNamed(broken, /open cart/i);
  expect(step.result).toBe("SERIOUS");
  // The click focuses the trigger button, but nothing moves focus into the
  // overlay and no dialog semantics are exposed.
  expect(step.transition.after.focus?.name).toBe("Open cart");
  expect(step.transition.after.focus?.name).not.toBe("Close");
  expect(step.transition.after.axTree.some((node) => node.role === "dialog")).toBe(false);
  const context = step.evaluation.findings.find((finding) => finding.category === "context");
  expect(context?.title).toMatch(/without dialog semantics/i);
  expect(context?.confidence).toBeGreaterThan(0.9);
});

test("4. fixed cart modal exposes a dialog and moves focus into it", () => {
  const step = stepNamed(fixed, /open cart/i);
  expect(step.result).toBe("PASS");
  const dialog = step.transition.after.axTree.find((node) => node.role === "dialog");
  expect(dialog).toBeTruthy();
  expect(dialog?.name).toBe("Your cart");
  expect(step.transition.before.focus?.name).not.toBe(step.transition.after.focus?.name);
  expect(step.transition.after.focus?.name).toBe("Close");
  expect(step.transition.treeDiff.focusChanged).toBe(true);
  expect(step.evaluation.findings.length).toBe(0);
});

test("5. tree diff reports added, removed, changed and focus changes", () => {
  const navigationStep = stepNamed(broken, /view wireless headphones/i);
  expect(navigationStep.transition.treeDiff.added).toBeGreaterThan(0);
  expect(navigationStep.transition.treeDiff.removed).toBeGreaterThan(0);

  const modalStep = stepNamed(broken, /open cart/i);
  expect(modalStep.transition.treeDiff.added).toBeGreaterThan(0);
  expect(modalStep.transition.treeDiff.liveRegionsAdded.length).toBe(0);
  expect(modalStep.transition.after.focus?.name).toBe("Open cart");

  const fixedModal = stepNamed(fixed, /open cart/i);
  expect(fixedModal.transition.treeDiff.focusChanged).toBe(true);
  expect(fixedModal.transition.treeDiff.liveRegionsAdded.length).toBe(0);

  const fixedAdd = stepNamed(fixed, /add to cart/i);
  expect(fixedAdd.transition.treeDiff.liveRegionsAdded.length).toBeGreaterThan(0);
});

test("6. mock judge output is deterministic", () => {
  const step = stepNamed(broken, /add to cart/i);
  expect(step.evaluation.provider).toBe("mock");
  expect(step.evaluation.fallbackUsed).toBeFalsy();
  expect(step.evaluation.judgments.feedback_exposed.confidence).toBe(0.96);
  expect(step.evaluation.judgments.feedback_exposed.value).toBe(false);
  expect(step.evaluation.confidence).toBe(0.96);
  expect(broken.fallbackUsed).toBeFalsy();
});

test("7. journey stops after the maximum action count", async () => {
  test.setTimeout(180_000);
  const api = await request.newContext({ baseURL: BASE });
  try {
    const response = await api.post("/api/analyze", {
      data: { url: `${BASE}/demo-shop?mode=broken`, goal: GOAL, maxActions: 1 },
      timeout: 150_000,
    });
    expect(response.ok()).toBeTruthy();
    const report = (await response.json()) as JourneyReport;
    expect(report.steps.length).toBe(1);
    expect(report.status).not.toBe("complete");
  } finally {
    await api.dispose();
  }
});

test("8. no destructive candidate actions execute during a journey", () => {
  for (const report of [broken, fixed]) {
    for (const step of report.steps) {
      const name = step.action.accessibleName ?? "";
      expect(name).not.toMatch(
        /\b(delete|remove|purchase|buy|pay|payment|send|upload|log ?out|sign ?out|unsubscribe|password)\b/i,
      );
    }
  }
});

test("9. the demo shop renders both experiences", async ({ page }) => {
  await page.goto("/demo-shop?mode=broken");
  await expect(page.getByRole("heading", { name: "Orbit Store" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Wireless Headphones" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open cart" })).toBeVisible();

  await page.goto("/demo-shop/product/wireless-headphones?mode=fixed");
  await expect(page.getByRole("heading", { name: "Wireless Headphones", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More options for Wireless Headphones" })).toBeVisible();
});

test("11. live browser frames stream while a journey runs", async () => {
  test.setTimeout(120_000);
  const api = await request.newContext({ baseURL: BASE });
  try {
    const startResponse = await api.post("/api/journeys", {
      data: { url: `${BASE}/demo-shop?mode=broken`, goal: GOAL, maxActions: 4 },
    });
    expect(startResponse.ok()).toBeTruthy();
    const { id } = (await startResponse.json()) as { id: string };

    let frameStatus = 0;
    let contentType = "";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const frame = await api.get(`/api/journeys/${id}/frame`);
      if (frame.status() === 200) {
        frameStatus = 200;
        contentType = frame.headers()["content-type"] ?? "";
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    expect(frameStatus).toBe(200);
    expect(contentType).toContain("image/jpeg");

    const runResponse = await api.get(`/api/journeys/${id}`);
    const payload = (await runResponse.json()) as { run: { goal: string; url: string } };
    expect(payload.run.goal).toBe(GOAL);
    expect(payload.run.url).toContain("/demo-shop");
  } finally {
    await api.dispose();
  }
});

test("10. the home page can start a journey and the report renders", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /See your interface/i })).toBeVisible();

  const startResponse = await page.request.post("/api/journeys", {
    data: { url: `${BASE}/demo-shop?mode=broken`, goal: GOAL },
  });
  expect(startResponse.ok()).toBeTruthy();
  const { id } = (await startResponse.json()) as { id: string };
  expect(id).toBeTruthy();

  await page.goto(`/analysis/${id}`);
  await expect(page.getByRole("heading", { name: "Semantic journey report" })).toBeVisible();
  await expect(page.getByText("Journey timeline")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("Semantic observations")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("Rules-based checks")).toBeVisible();
});
