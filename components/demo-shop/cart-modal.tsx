"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { useStore } from "./store-shell";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CartModal() {
  const { mode, cart, cartOpen, closeCart } = useStore();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  const handleClose = React.useCallback(() => {
    closeCart();
    if (mode === "fixed") {
      window.setTimeout(() => {
        document.getElementById("cart-trigger")?.focus();
      }, 0);
    }
  }, [closeCart, mode]);

  React.useEffect(() => {
    if (!cartOpen || mode !== "fixed") return;
    closeButtonRef.current?.focus();
  }, [cartOpen, mode]);

  React.useEffect(() => {
    if (!cartOpen || mode !== "fixed") return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cartOpen, mode, handleClose]);

  if (!cartOpen) return null;

  const subtotal = cart.reduce((total, item) => total + item.product.price * item.qty, 0);

  const dialogProps =
    mode === "fixed"
      ? {
          role: "dialog" as const,
          "aria-modal": true,
          "aria-labelledby": "cart-dialog-title",
          tabIndex: -1,
        }
      : {};

  return (
    <div className="cart-modal fixed inset-0 z-50" data-overlay="cart" {...dialogProps}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      <div
        ref={panelRef}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l bg-card shadow-xl"
      >
        <div className="flex items-center justify-between gap-4 border-b px-6 py-5">
          {mode === "fixed" ? (
            <h2 id="cart-dialog-title" className="text-lg font-semibold">
              Your cart
            </h2>
          ) : (
            <div className="text-lg font-semibold">Your cart</div>
          )}
          <Button
            ref={closeButtonRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
          >
            Close
          </Button>
        </div>

        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">Your cart is empty</p>
            <Link
              href={`/demo-shop?mode=${mode}`}
              onClick={handleClose}
              className="rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Back to shop
            </Link>
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {cart.map((item) => (
              <div
                key={item.product.slug}
                className="flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.product.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Qty {item.qty}</p>
                </div>
                <span className="text-sm font-medium">
                  ${item.product.price * item.qty}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t px-6 py-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">${subtotal}</span>
          </div>
          <Button asChild className="mt-4 w-full">
            <Link href={`/demo-shop/checkout?mode=${mode}`} onClick={handleClose}>
              Continue to checkout
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
