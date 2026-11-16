"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function DebugPanel({ sections }: { sections: { title: string; data: unknown }[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isOpen = open === section.title;
        return (
          <div key={section.title} className="overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : section.title)}
              className="flex w-full items-center gap-2 bg-muted/50 px-3 py-2 text-left text-xs font-medium hover:bg-muted"
            >
              <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
              {section.title}
            </button>
            {isOpen ? (
              <pre className="scroll-thin max-h-[360px] overflow-auto bg-card px-3 py-2 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(section.data, null, 2)}
              </pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
