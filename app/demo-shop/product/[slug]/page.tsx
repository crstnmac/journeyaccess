import { notFound } from "next/navigation";

import { findProduct } from "@/components/demo-shop/data";
import { ProductDetail } from "@/components/demo-shop/product-detail";
import { StoreShell, type StoreMode } from "@/components/demo-shop/store-shell";

type ProductPageParams = Promise<{ slug: string }>;
type ProductPageSearchParams = Promise<{ mode?: string | string[] }>;

function normalizeMode(value: string | string[] | undefined): StoreMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fixed" ? "fixed" : "broken";
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: ProductPageParams;
  searchParams: ProductPageSearchParams;
}) {
  const { slug } = await params;
  const { mode } = await searchParams;

  const product = findProduct(slug);
  if (!product) notFound();

  const resolvedMode = normalizeMode(mode);

  return (
    <StoreShell mode={resolvedMode} pathname={`/demo-shop/product/${slug}`}>
      <ProductDetail product={product} mode={resolvedMode} />
    </StoreShell>
  );
}
