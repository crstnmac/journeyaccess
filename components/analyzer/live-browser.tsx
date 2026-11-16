"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorPlay, MousePointerClick } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JourneyStep } from "@/types/journey";

import { ResultBadge } from "./shared";

const FRAME_INTERVAL_MS = 400;

/**
 * Near-live view of the browser running the journey. Frames are polled from
 * the frame endpoint; the previous frame stays on screen while the next one
 * loads, so the stream never flashes.
 */
export function LiveBrowser({
  id,
  active,
  phase,
  message,
  steps,
  goal,
}: {
  id: string;
  active: boolean;
  phase: string;
  message: string;
  steps: JourneyStep[];
  goal: string;
}) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [stalled, setStalled] = useState(false);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const next = `/api/journeys/${id}/frame?t=${Date.now()}`;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        failuresRef.current = 0;
        setStalled(false);
        setFrameSrc(next);
        setFrameCount((count) => count + 1);
      };
      image.onerror = () => {
        if (cancelled) return;
        failuresRef.current += 1;
        if (failuresRef.current > 12) setStalled(true);
      };
      image.src = next;
    };

    tick();
    const timer = window.setInterval(tick, FRAME_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, id]);

  const lastStep = steps[steps.length - 1];

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-neutral-950 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
            </span>
            <span className="ml-1 flex items-center gap-1.5 font-mono text-[11px] text-white/60">
              <MonitorPlay className="size-3.5" />
              chromium · headless
            </span>
          </div>
          <div className="flex items-center gap-2">
            {stalled ? (
              <span className="font-mono text-[11px] text-white/40">frame unavailable</span>
            ) : (
              <span className="font-mono text-[11px] text-white/40">{frameCount} frames</span>
            )}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                active ? "bg-red-500/15 text-red-300" : "bg-white/10 text-white/50",
              )}
            >
              <span className={cn("size-1.5 rounded-full", active ? "bg-red-400 pulse-dot" : "bg-white/40")} />
              {active ? "live" : "ended"}
            </span>
          </div>
        </div>

        <div className="relative aspect-[16/10] bg-neutral-900">
          {frameSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={frameSrc}
              alt="Live view of the browser running the journey"
              className="absolute inset-0 size-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/40">
              <MonitorPlay className="size-6" />
              <span className="font-mono text-[11px]">waiting for the first frame…</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 border-t border-white/10 px-3 py-2.5">
          <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-blue-300" />
          <div className="min-w-0">
            <div className="truncate font-mono text-[11px] text-white/80">{message}</div>
            <div className="truncate text-[11px] text-white/40">
              phase: {phase} · goal: {goal}
            </div>
          </div>
        </div>
      </div>

      {lastStep ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            step {lastStep.step}
          </Badge>
          <span className="text-xs">{lastStep.title}</span>
          <ResultBadge result={lastStep.result} />
          {lastStep.evaluation.findings[0] ? (
            <span className="text-[11px] text-muted-foreground">
              {lastStep.evaluation.findings[0].title}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
