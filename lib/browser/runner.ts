import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  strategy: string;
};

export const JOURNEY_LIMITS = {
  maxActions: 10,
  stepTimeoutMs: 30_000,
  settleMs: 350,
  navTimeoutMs: 30_000,
};

const LAUNCH_ARGS = [
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--force-color-profile=srgb",
  "--hide-scrollbars",
];

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out: " + label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createSession(
  strategy: string,
  launch: () => Promise<Browser>,
): Promise<BrowserSession> {
  let browser: Browser | undefined;
  try {
    browser = await launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      locale: "en-US",
      reducedMotion: "reduce",
    });
    context.setDefaultTimeout(10_000);
    context.setDefaultNavigationTimeout(JOURNEY_LIMITS.navTimeoutMs);
    const page = await context.newPage();
    return { browser, context, page, strategy };
  } catch (error) {
    await browser?.close().catch(() => {});
    throw error;
  }
}

export async function launchBrowser(): Promise<BrowserSession> {
  const envChannel = process.env.PLAYWRIGHT_CHANNEL?.trim();
  const attempts: Array<{ strategy: string; launch: () => Promise<Browser> }> = [];

  if (envChannel) {
    attempts.push({
      strategy: `channel:${envChannel}`,
      launch: () => chromium.launch({ headless: true, channel: envChannel, args: LAUNCH_ARGS }),
    });
  }
  attempts.push({
    strategy: "bundled",
    launch: () => chromium.launch({ headless: true, args: LAUNCH_ARGS }),
  });
  attempts.push({
    strategy: "channel:chrome",
    launch: () => chromium.launch({ headless: true, channel: "chrome" }),
  });

  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      return await createSession(attempt.strategy, attempt.launch);
    } catch (error) {
      failures.push(`${attempt.strategy}: ${errorMessage(error)}`);
    }
  }

  throw new Error(
    `Unable to launch Chromium. Tried ${attempts.length} strategies: ${failures.join(" | ")}`,
  );
}

export async function closeBrowser(session: BrowserSession): Promise<void> {
  await session.context.close().catch(() => {});
  await session.browser.close().catch(() => {});
}
