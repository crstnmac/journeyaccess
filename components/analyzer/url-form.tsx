"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type Experience = "broken" | "fixed";

function withMode(url: string, mode: Experience): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("mode", mode);
    return parsed.toString();
  } catch {
    return url;
  }
}

function modeOf(url: string): Experience {
  try {
    return new URL(url).searchParams.get("mode") === "fixed" ? "fixed" : "broken";
  } catch {
    return "broken";
  }
}

export function UrlForm({
  defaultBaseUrl,
  defaultGoal,
}: {
  defaultBaseUrl: string;
  defaultGoal: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(`${defaultBaseUrl}/demo-shop?mode=broken`);
  const [goal, setGoal] = useState(defaultGoal);
  const [mode, setMode] = useState<Experience>("broken");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExperimental = (() => {
    try {
      const parsed = new URL(url);
      const local = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsed.hostname);
      return !(local && parsed.pathname.startsWith("/demo-shop"));
    } catch {
      return true;
    }
  })();

  async function run(targetUrl: string, targetGoal: string) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/journeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, goal: targetGoal }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? `Request failed with ${response.status}`);
      }
      router.push(`/analysis/${payload.id}`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Analyze a journey</CardTitle>
        <CardDescription>
          A browser visits the URL, interacts through accessible roles and names, and judges each
          accessibility state transition.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="journey-url" className="text-sm font-medium">
            URL
          </label>
          <Input
            id="journey-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            spellCheck={false}
            className="font-mono text-xs"
          />
          {isExperimental ? (
            <p className="flex items-center gap-1.5 text-xs text-friction">
              <TriangleAlert className="size-3.5" />
              Experimental: external sites may block automation, require authentication, or expose
              very large accessibility trees.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="journey-goal" className="text-sm font-medium">
            Goal
          </label>
          <Input
            id="journey-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            className="text-sm"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Experience</legend>
          <RadioGroup
            value={mode}
            onValueChange={(value) => {
              const next = value as Experience;
              setMode(next);
              setUrl((current) => withMode(current, next));
            }}
            className="flex gap-5"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="broken" id="experience-broken" />
              Broken
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="fixed" id="experience-fixed" />
              Fixed
            </label>
          </RadioGroup>
        </fieldset>

        {error ? (
          <p className="rounded-md border border-serious/30 bg-serious/5 px-3 py-2 text-xs text-serious">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={submitting} onClick={() => run(url, goal)}>
            {submitting ? <Loader2 className="animate-spin" /> : <Play />}
            Run semantic journey
          </Button>
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => {
              const demoUrl = withMode(`${defaultBaseUrl}/demo-shop`, "broken");
              setMode("broken");
              setUrl(demoUrl);
              setGoal(defaultGoal);
              void run(demoUrl, defaultGoal);
            }}
          >
            <Sparkles />
            Run demo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Orbit Store is synthetic and safe. Journeys never submit payment, delete data, send
          messages, or authenticate. Maximum 10 actions, 30 second step timeout.
        </p>
      </CardContent>
    </Card>
  );
}

export { modeOf };
