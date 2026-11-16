# Semantic Journey

**Semantic Accessibility Journey Analyzer**

> Test whether an interface still makes sense when you experience it through semantics instead of sight.

Semantic Journey drives a real browser through a user goal, interacts with the page **only through
accessible roles and names**, captures the accessibility tree, focus and DOM mutations before and
after every action, and asks [Jev](https://docs.typesafe.ai) (TypeSafe) narrow structured questions
about each transition.

It is **not** another WCAG scanner, and it does not claim WCAG conformance.

```
Page → accessibility issues          (what static scanners do)
Accessibility state BEFORE → action → accessibility state AFTER → semantic judgment
```

The hero capability is understanding **accessibility semantics across interactions and state
transitions**.

---

## What it is

Traditional automated tools are excellent at deterministic rules. Some accessibility failures only
appear in interaction:

- Was the result of an action communicated?
- Did focus move somewhere sensible?
- Did a dialog expose itself as a dialog?
- Can the next action be discovered from the accessibility tree?
- Did important visual information fail to appear semantically?
- Did a state change preserve meaning?
- Does this situation require manual accessibility review?

Semantic Journey answers these questions with evidence you can inspect: raw AX nodes, normalized
trees, before/after diffs, focus snapshots, DOM mutations, axe results, the exact evidence object
sent to the model, and the model's structured judgments with raw probabilities.

### Deterministic checks vs semantic judgments

| Layer | Role |
| --- | --- |
| **axe-core** | Deterministic, standards-based rules. Run at load and after major state changes. Findings are stored separately. |
| **Jev (TypeSafe)** | Contextual, structured judgments over a single transition (feedback exposure, focus transition, semantic context, goal progress, manual review, impact). |
| **Playwright** | Interaction and state capture. Model output never becomes a selector: actions are executed through role/name locators only. |

---

## Why accessibility-tree transitions matter

A visual user sees a toast appear, a modal slide in, a counter increment. A screen-reader user
receives only what the accessibility layer exposes at the right moment.

The included demo makes this concrete. In **Broken** mode:

| Problem | What happens | What the analyzer sees |
| --- | --- | --- |
| A. Unannounced confirmation | `Added to cart ✓` appears visually and disappears after a few seconds. No `role="status"`, no `aria-live`, focus does not move. | DOM changed, text appeared, **no live/status semantics added** → feedback finding (confidence 0.9) |
| B. Broken cart dialog | A modal panel renders, but has no `role="dialog"`, no accessible name, focus stays on the underlying trigger, background stays reachable. | Large visual change, **no dialog role**, **focus never enters the overlay** → serious context finding |
| C. Ambiguous control | A `More` button whose meaning depends on nearby visuals. | `button "More"` with no distinguishing accessible context → observation |
| D. Weak association | `Only 2 left` is visually near Wireless Headphones but not referenced by any control. | Text present, **not referenced by any accessible description** → observation |

In **Fixed** mode the same journey produces a clean report: status feedback is exposed, the cart is a
named dialog with focus moved into it and restored on close, the secondary control has a meaningful
name, and the stock text is associated via `aria-describedby`.

Run the same goal against both and the difference is the product.

---

## Architecture

```
                    Browser (Chromium via Playwright)
                       │
          ┌────────────┴────────────┐
          │                         │
         DOM                  Accessibility Tree
          │                    (CDP getFullAXTree)
          │                         │
     MutationObserver          normalization
     focus tracking                 │
          │                  before / after diff
          │                         │
          └────────────┬────────────┘
                       │
                  compact evidence
                 (never the raw page)
                       │
                     Jev
             (structured judgments)
                       │
                Journey Report
                       │
        ┌──────────────┴──────────────┐
     axe findings              semantic findings
     (deterministic)            (contextual)
```

### Flow per action

1. Capture the current accessibility tree (normalized), focus and a screenshot.
2. Build the candidate action space from accessible nodes (role + name, deduplicated, destructive
   controls excluded).
3. Ask Jev which offered candidate most directly progresses toward the goal. Jev may only choose an
   offered action, `done`, or `blocked`. Low confidence stops autonomous execution and marks the
   step for review.
4. Execute the chosen action with `page.getByRole(role, { name })` — never a CSS selector.
5. Capture the after state: AX tree, focus, DOM mutations, screenshot, and axe after major changes.
6. Build the semantic diff and a compact evidence object.
7. Ask Jev six narrow questions about the transition.
8. Derive findings with evidence, impact and the raw probability; record the step.

### Project structure

```
app/
  page.tsx                     home: run form, what this tests, recent analyses
  demo-shop/                   Orbit Store (broken + fixed), checkout
  analysis/[id]/               report dashboard
  api/analyze/                 synchronous analysis (used by tests)
  api/journeys/                create + poll runs, list recent reports
components/
  analyzer/                    timeline, before/after inspector, issue cards, comparison
  demo-shop/                   storefront, cart modal, toast, product detail
  ui/                          shadcn-style primitives
lib/
  accessibility/               capture, normalize, diff, focus, mutations, axe
  browser/                     runner, candidates, actions, journey engine
  jev/                         types, prompts, signals, mock provider, live provider
  journeys/                    run registry, background service, validation
  reports/                     report builder, SQLite persistence
tests/
  unit/                        node:test — tree diff, mock judge, destructive denylist
  e2e/                         Playwright — the full journey, broken vs fixed
```

---

## Getting started

Requirements: Node 22+, pnpm, a Chromium-based browser.

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

Open <http://localhost:3000>.

If the Chromium download is unavailable, the runner automatically falls back to an installed Google
Chrome. You can select it explicitly:

```env
PLAYWRIGHT_CHANNEL=chrome
```

The runner tries, in order: `PLAYWRIGHT_CHANNEL` (when set) → Playwright's bundled Chromium →
`channel: "chrome"`.

### Environment

```env
# live = call the real Jev API, mock = deterministic local judgments
JEV_MODE=live

JEV_API_KEY=
JEV_ENDPOINT=https://api.typesafe.ai/v1/systemone
JEV_MODEL=jev-latest

PLAYWRIGHT_CHANNEL=chrome
```

Copy `.env.example` to `.env` and fill in `JEV_API_KEY`.

- **Without a key** the app runs fully with `MockJevProvider` (deterministic, offline, used by the
  tests). It never pretends to be the live model.
- **With a key** the live provider is used, wrapped in a fallback judge. If the model is unreachable
  or returns a malformed response, the affected transitions fall back to deterministic judgments and
  the report is labelled **“Semantic model unavailable — fallback analysis used”**. Live results are
  never fabricated.

### The live provider

The adapter lives in `lib/jev/live-provider.ts` and speaks the verified TypeSafe contract:

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $JEV_API_KEY
{ model, state: { page, elements, recent_actions }, questions: { <id>: { type: "choice", criteria, instructions } } }
→ { model, answers: { <id>: { choice, confidence, probabilities } }, usage }
```

Responses are validated (choice ∈ criteria, probabilities cover the criteria and sum to 1, confidence
in range, chosen label has the maximum probability). Invalid responses raise
`JevProviderError({ malformed: true })` and trigger the labelled fallback.

Question kinds (`noul`, `choice`, `score`) are defined in `lib/jev/prompts.ts` and serialized as
TypeSafe `choice` questions; the semantic difference is preserved in the parsed judgment.

---

## Live browser stream

While a journey runs, the report page shows a near-live view of the browser: frames are polled from
`GET /api/journeys/:id/frame` a few times per second, so you watch the page navigate, the toast
appear, and the modal open as it happens. Before each action the runner draws a synthetic cursor and
highlight ring over the target element, so you can see what the agent is about to do.

The overlay is presentation only: it is marked `data-sj-overlay` and `aria-hidden`, and the mutation
observer explicitly ignores it. It never enters the accessibility tree, the captured mutations, or
the model evidence — the stream is for the audience, not for the analyzer.

This is deliberate polling rather than a screencast protocol: a few JPEG frames per second are enough
to follow the journey and keep the implementation small. The endpoint returns `204` while the page is
mid-navigation, and the client keeps the previous frame on screen.

## Demo narrative (60 seconds)

1. Open Semantic Journey. The goal is pre-filled:
   `Find Wireless Headphones, add them to the cart, open the cart, and continue toward checkout.`
2. Click **Run demo** (Broken mode).
3. Watch the browser interact through accessible semantics only — live, with a cursor highlighting
   each target.
4. Add to cart shows `Added to cart ✓` visually — the analyzer reports
   *Potential unannounced action feedback*.
5. Open cart shows a modal — the analyzer reports *Overlay appeared without dialog semantics*, with
   focus remaining on the underlying trigger.
6. Expand any step: before/after accessibility trees, the diff, DOM mutations, focus, axe, and the
   exact Jev judgments with probabilities.
7. Click **Compare with fixed implementation**.
8. The identical journey now passes every step: status feedback exposed, dialog exposed with an
   accessible name, focus moved into the dialog.

---

## Reports

Each report contains:

- `status`: `complete`, `complete_with_friction`, `blocked`, `uncertain`, or `error`
- `steps`: full transitions (before/after AX trees, diff, mutations, focus, screenshots, axe,
  judgments)
- `semanticFindings`: contextual findings with evidence, impact, confidence and a suggested review
- `axeFindings`: deterministic rule violations, kept separate
- `requiresManualReview`
- `fallbackUsed` / `fallbackReason`

No overall 0–100 score is produced. There is no defensible methodology for one, and a single number
would hide exactly the context this tool exists to surface.

### Evidence and confidence

Every AI-derived finding shows its evidence, the driving question, and the raw probability. Labels
(High confidence / Medium confidence / Needs human review) are shown alongside the number — never
instead of it. Findings below 0.2 probability are treated as model hedging and are kept only in the
developer evidence panel.

### Calibration

A few thresholds are deliberately explicit and tunable:

- Action selection below **0.4** confidence stops autonomous execution.
- An impact changes a step result only above calibrated evidence floors
  (blocking ≥ 0.6, serious ≥ 0.4, friction ≥ 0.25).
- Page-level observations (ambiguous names, weak associations) appear in the report and can trigger
  manual review, but do not by themselves fail a step.
- A journey that reaches the action limit without completing the goal is reported as `uncertain`,
  never `complete`.

---

## Safety limits

- Maximum **10 actions** per journey, **30 s** per step, 25 s per model request.
- Destructive controls are excluded from the candidate action space and re-checked at execution:
  delete, remove, purchase, buy, pay, send, upload, log out, password, unsubscribe, and similar.
- Journeys never authenticate, submit payment, upload files, or send messages.
- External URLs are labelled **Experimental**: sites may block automation or expose very large trees.
- Only `http` and `https` targets are accepted.

---

## Tests

```bash
pnpm test          # unit + e2e
pnpm test:unit     # node:test (tree diff, mock judge, denylist, candidates)
pnpm test:e2e      # Playwright, runs against a dev server with JEV_MODE=mock
pnpm typecheck
pnpm lint
```

The e2e suite runs the real browser journey twice (broken and fixed) and asserts:

1. Broken *Add to cart* produces a semantic feedback warning.
2. Fixed *Add to cart* produces none.
3. Broken cart modal detects wrong focus and missing dialog semantics.
4. Fixed cart modal exposes a named dialog and moves focus into it.
5. Tree diff reports added / removed / changed / focus / live-region changes.
6. Mock judge output is deterministic.
7. The journey stops at the maximum action count.
8. No destructive candidate action ever executes.
9. Both demo experiences render.
10. A journey started from the home page renders its report.

---

## API

```http
POST /api/analyze
{ "url": "http://localhost:3000/demo-shop?mode=broken", "goal": "..." }
→ JourneyReport            (synchronous, used by tests)

POST /api/journeys
{ "url": "...", "goal": "...", "maxActions": 4 }
→ { "id": "..." }          (runs in the background)

GET /api/journeys/:id      → { run, report }   (progress polling)
GET /api/journeys          → { reports: [...] } (recent analyses)
```

Progress is polled rather than streamed: it is simpler, survives dev-server reloads, and keeps the
report page resilient. Runs are persisted to SQLite (`node:sqlite`, `.data/semantic-journey.db`).

Add `?debug=true` to a report URL (or use the **Developer evidence** toggle) to expose raw AX nodes,
normalized trees, DOM mutation data, focus snapshots, axe JSON, Jev inputs and outputs, candidate
actions, and selected actions.

---

## Limitations

- A semantic finding is a **potential** accessibility issue, not a WCAG failure. Contextual findings
  need expert review and testing with real assistive technologies.
- The candidate action space is intentionally narrow: links, buttons, checkboxes, radios, comboboxes,
  text fields, tabs, and menu items. Free-text generation and arbitrary keyboard widgets are out of
  scope for this prototype.
- Focus trapping, `inert`, and dialog behaviour differ across browsers and screen readers; the
  analyzer observes one browser.
- Shadow DOM, cross-origin iframes, canvas, and native file pickers are not traversed.
- `node:sqlite` is an experimental Node API; it may emit a warning in the console.

## Roadmap

- **Regression mode**: store a successful semantic journey as a baseline and diff later runs
  (`semantic-journey test ./journeys/checkout.yaml`).
- Per-journey configuration files, CI output formats, and GitHub checks.
- Optional streaming progress via Server-Sent Events.
