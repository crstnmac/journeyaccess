"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CartModal } from "./cart-modal";
import type { Product } from "./data";

export type StoreMode = "broken" | "fixed";

export type CartItem = {
  product: Product;
  qty: number;
};

type StoreContextValue = {
  mode: StoreMode;
  cart: CartItem[];
  addToCart: (product: Product) => void;
  openCart: () => void;
  closeCart: () => void;
  cartOpen: boolean;
  cartCount: number;
};

const StoreContext = React.createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const context = React.useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used inside StoreShell");
  }
  return context;
}

type StoreProviderProps = {
  mode: StoreMode;
  children: React.ReactNode;
};

export function StoreProvider({ mode, children }: StoreProviderProps) {
  const [cart, setCart] = React.useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);

  const addToCart = React.useCallback((product: Product) => {
    setCart((previous) => {
      const existing = previous.find((item) => item.product.slug === product.slug);
      if (existing) {
        return previous.map((item) =>
          item.product.slug === product.slug ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...previous, { product, qty: 1 }];
    });
  }, []);

  const openCart = React.useCallback(() => setCartOpen(true), []);
  const closeCart = React.useCallback(() => setCartOpen(false), []);

  const cartCount = cart.reduce((total, item) => total + item.qty, 0);

  const value = React.useMemo(
    () => ({ mode, cart, addToCart, openCart, closeCart, cartOpen, cartCount }),
    [mode, cart, addToCart, openCart, closeCart, cartOpen, cartCount],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function ModeSwitcher({ pathname }: { pathname: string }) {
  const { mode } = useStore();

  return (
    <div className="border-b bg-secondary/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs sm:px-6">
        <span className="font-medium text-muted-foreground">Experience:</span>
        <Link
          href={`${pathname}?mode=broken`}
          aria-current={mode === "broken" ? "true" : undefined}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === "broken"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Broken experience
        </Link>
        <Link
          href={`${pathname}?mode=fixed`}
          aria-current={mode === "fixed" ? "true" : undefined}
          className={cn(
            "rounded-full px-2.5 py-0.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === "fixed"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          Fixed experience
        </Link>
        <span className="hidden text-muted-foreground md:inline">
          Intentional accessibility differences for the Semantic Journey demo.
        </span>
      </div>
    </div>
  );
}

function StoreChrome({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { mode, cartCount, cartOpen, openCart } = useStore();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div
        className="flex flex-1 flex-col"
        inert={cartOpen && mode === "fixed" ? true : undefined}
      >
        <ModeSwitcher pathname={pathname} />

        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <span className="text-base font-semibold tracking-tight">Orbit Store</span>

            <div className="relative">
              <Button
                id="cart-trigger"
                type="button"
                variant="outline"
                size="sm"
                onClick={openCart}
              >
                Open cart
                {mode === "fixed" ? (
                  <span className="sr-only">
                    , {cartCount} {cartCount === 1 ? "item" : "items"} in cart
                  </span>
                ) : null}
              </Button>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-medium text-background"
              >
                {cartCount}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
            Orbit Store — demo storefront for the Semantic Journey analyzer.
          </div>
        </footer>
      </div>

      <CartModal />
    </div>
  );
}

type StoreShellProps = StoreProviderProps & {
  pathname: string;
};

export function StoreShell({ mode, pathname, children }: StoreShellProps) {
  return (
    <StoreProvider mode={mode}>
      <StoreChrome pathname={pathname}>{children}</StoreChrome>
    </StoreProvider>
  );
}
