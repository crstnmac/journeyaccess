import Link from "next/link";
import { headers } from "next/headers";
import { Accessibility, ArrowUpRight, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AboutPanel } from "@/components/analyzer/about-panel";
import { RecentAnalyses, RecentAnalysesHeader } from "@/components/analyzer/recent-analyses";
import { UrlForm } from "@/components/analyzer/url-form";
import { DEFAULT_GOAL } from "@/lib/browser/journey";
import { listReports } from "@/lib/reports/store";

export const dynamic = "force-dynamic";

const CHECKS = [
  "Accessibility-tree changes",
  "Focus behavior",
  "Dynamic feedback",
  "Semantic context",
  "Deterministic axe checks",
  "Goal completion",
];

async function baseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}

export default async function HomePage() {
  const base = await baseUrl();
  const reports = listReports(8);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg border bg-card">
            <Accessibility className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">Semantic Journey</div>
            <div className="text-[11px] text-muted-foreground">Semantic Accessibility Journey Analyzer</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/demo-shop?mode=broken"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
          >
            Open Orbit Store
            <ArrowUpRight className="size-3.5" />
          </Link>
          <Badge variant="info" className="text-[11px]">
            prototype
          </Badge>
        </div>
      </header>

      <section className="space-y-3">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight">
          See your interface the way accessibility APIs expose it.
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Given a webpage and a user goal, Semantic Journey observes the interface through its
          accessibility representation, performs semantic interactions, and determines whether the
          user receives enough accessible information to understand and continue the journey.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="muted">accessibility tree before → action → after</Badge>
          <Badge variant="muted">focus transitions</Badge>
          <Badge variant="muted">DOM mutations</Badge>
          <Badge variant="muted">axe-core + Jev</Badge>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <UrlForm defaultBaseUrl={base} defaultGoal={DEFAULT_GOAL} />

        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <h2 className="text-sm font-semibold">What this tests</h2>
            <ul className="mt-3 space-y-2">
              {CHECKS.map((check) => (
                <li key={check} className="flex items-center gap-2 text-sm">
                  <span className="flex size-4 items-center justify-center rounded-full bg-pass/15 text-pass">
                    <Check className="size-2.5" />
                  </span>
                  {check}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              The hero capability is understanding accessibility semantics across interactions and
              state transitions — not scanning static markup.
            </p>
          </div>
          <AboutPanel />
        </div>
      </div>

      <section className="space-y-3">
        <RecentAnalysesHeader />
        <RecentAnalyses rows={reports} />
      </section>

      <footer className="border-t pt-6 text-[11px] text-muted-foreground">
        Semantic Journey is an accessibility testing aid. Results should not be interpreted as
        certification of WCAG conformance.
      </footer>
    </div>
  );
}
