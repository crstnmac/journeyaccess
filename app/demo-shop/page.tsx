import type { Metadata } from "next";

import { PRODUCTS } from "@/components/demo-shop/data";
import { ProductCard } from "@/components/demo-shop/product-card";
import { StoreShell, type StoreMode } from "@/components/demo-shop/store-shell";

type DemoShopSearchParams = Promise<{ mode?: string | string[] }>;

function normalizeMode(value: string | string[] | undefined): StoreMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fixed" ? "fixed" : "broken";
}

export function generateMetadata(): Metadata {
  return { title: "Orbit Store — Semantic Journey demo target" };
}

export default async function DemoShopPage({
  searchParams,
}: {
  searchParams: DemoShopSearchParams;
}) {
  const { mode } = await searchParams;
  const resolvedMode = normalizeMode(mode);

  return (
    <StoreShell mode={resolvedMode} pathname="/demo-shop">
      <section className="border-b bg-secondary/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Orbit Store</h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Gear for people who ship.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">Featured products</h2>
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.slug} product={product} mode={resolvedMode} />
          ))}
        </div>
      </section>
    </StoreShell>
  );
}
