import { z } from "zod";

import type { JourneyMode } from "@/types/journey";

export const analyzeRequestSchema = z.object({
  url: z.string().url().max(2048),
  goal: z.string().min(8).max(500),
  mode: z.enum(["broken", "fixed", "external"]).optional(),
  maxActions: z.number().int().min(1).max(10).optional(),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export function assertHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported protocol "${url.protocol}" — only http and https are allowed`);
  }
  return url;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function deriveMode(url: string): JourneyMode {
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("mode");
    if (LOCAL_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/demo-shop")) {
      return mode === "fixed" ? "fixed" : "broken";
    }
    if (mode === "fixed") return "fixed";
    if (mode === "broken") return "broken";
    return "external";
  } catch {
    return "external";
  }
}

export function isExperimentalTarget(url: string): boolean {
  return deriveMode(url) === "external";
}
