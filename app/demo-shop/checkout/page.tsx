import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StoreShell, type StoreMode } from "@/components/demo-shop/store-shell";

type CheckoutSearchParams = Promise<{ mode?: string | string[] }>;

function normalizeMode(value: string | string[] | undefined): StoreMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "fixed" ? "fixed" : "broken";
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: CheckoutSearchParams;
}) {
  const { mode } = await searchParams;
  const resolvedMode = normalizeMode(mode);

  return (
    <StoreShell mode={resolvedMode} pathname="/demo-shop/checkout">
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Demo checkout — no payment or personal information required.
        </p>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Order summary</CardTitle>
            <CardDescription>Your selected items will appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Order summary placeholder
            </div>
          </CardContent>
        </Card>

        <Link
          href={`/demo-shop?mode=${resolvedMode}`}
          className="mt-6 inline-flex items-center rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Back to shop
        </Link>
      </section>
    </StoreShell>
  );
}
