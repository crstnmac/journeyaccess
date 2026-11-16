import Link from "next/link";
import { Camera, Headphones, Keyboard, Usb, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { Product } from "./data";

const PRODUCT_ICONS: Record<string, LucideIcon> = {
  "wireless-headphones": Headphones,
  "mechanical-keyboard": Keyboard,
  "usb-c-dock": Usb,
  webcam: Camera,
};

export function ProductCard({
  product,
  mode,
}: {
  product: Product;
  mode: "broken" | "fixed";
}) {
  const Icon = PRODUCT_ICONS[product.slug] ?? Headphones;

  return (
    <Card className="flex flex-col overflow-hidden">
      <div
        className={cn(
          "flex h-40 items-center justify-center bg-gradient-to-br",
          product.accent,
        )}
      >
        <Icon aria-hidden="true" className="size-12 text-foreground/35" />
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-semibold tracking-tight">{product.name}</h3>
        <p className="text-sm font-medium">${product.price}</p>
        <p className="flex-1 text-sm leading-6 text-muted-foreground">{product.blurb}</p>
        <Link
          href={`/demo-shop/product/${product.slug}?mode=${mode}`}
          className="inline-flex w-fit items-center rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View {product.name}
        </Link>
      </CardContent>
    </Card>
  );
}
