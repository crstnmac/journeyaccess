"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Headphones, Keyboard, Usb, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { Product } from "./data";
import { useStore } from "./store-shell";

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  "wireless-headphones": Headphones,
  "mechanical-keyboard": Keyboard,
  "usb-c-dock": Usb,
  webcam: Camera,
};

const SECONDARY_ACTIONS = ["Compare", "Add to wishlist", "Report an issue"] as const;

export function ProductDetail({
  product,
  mode,
}: {
  product: Product;
  mode: "broken" | "fixed";
}) {
  const { addToCart } = useStore();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [toastId, setToastId] = React.useState(0);

  React.useEffect(() => {
    if (toastId === 0) return;
    // Long enough for an analyzer to capture the state, short enough to demonstrate
    // that the confirmation is transient.
    const timer = window.setTimeout(() => setToastId(0), 6000);
    return () => window.clearTimeout(timer);
  }, [toastId]);

  const Icon = PRODUCT_ICONS[product.slug] ?? Headphones;
  const stockId = `stock-${product.slug}`;

  function handleAddToCart() {
    addToCart(product);
    setToastId((current) => current + 1);
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link
        href={`/demo-shop?mode=${mode}`}
        className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to shop
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div
          className={cn(
            "flex aspect-[4/3] items-center justify-center rounded-xl bg-gradient-to-br",
            product.accent,
          )}
        >
          <Icon aria-hidden="true" className="size-16 text-foreground/35" />
        </div>

        <div className="flex flex-col">
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">${product.price}</span>
            {product.stock ? (
              mode === "fixed" ? (
                <span id={stockId} className="text-xs font-medium text-friction">
                  {product.stock}
                </span>
              ) : (
                <span className="text-xs font-medium text-friction">{product.stock}</span>
              )
            ) : null}
          </div>

          <p className="mt-4 max-w-prose text-sm leading-6 text-muted-foreground">
            {product.blurb}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="lg"
              onClick={handleAddToCart}
              {...(mode === "fixed" && product.stock
                ? { "aria-describedby": stockId }
                : {})}
            >
              Add to cart
            </Button>

            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setMoreOpen((open) => !open)}
                {...(mode === "fixed"
                  ? { "aria-label": `More options for ${product.name}` }
                  : {})}
              >
                More
              </Button>
              {moreOpen ? (
                <div className="absolute left-0 top-full z-10 mt-2 w-52 rounded-lg border bg-popover p-1 shadow-md">
                  {SECONDARY_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {toastId > 0 ? (
        mode === "fixed" ? (
          <div
            role="status"
            aria-live="polite"
            className="toast fixed bottom-6 right-6 z-50 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-lg"
          >
            Added to cart ✓
          </div>
        ) : (
          <div className="toast fixed bottom-6 right-6 z-50 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-lg">
            Added to cart ✓
          </div>
        )
      ) : null}
    </section>
  );
}
