export type Product = {
  slug: string;
  name: string;
  price: number;
  blurb: string;
  accent: string;
  stock?: string;
};

export const PRODUCTS: Product[] = [
  {
    slug: "wireless-headphones",
    name: "Wireless Headphones",
    price: 149,
    blurb:
      "Active noise cancelling with 40 hours of battery life. Memory foam earcups keep long sessions comfortable.",
    accent: "from-slate-200 to-slate-300",
    stock: "Only 2 left",
  },
  {
    slug: "mechanical-keyboard",
    name: "Mechanical Keyboard",
    price: 89,
    blurb:
      "Hot-swappable switches in a compact 75% layout. A gasket-mounted aluminium frame keeps every keystroke quiet.",
    accent: "from-zinc-200 to-zinc-300",
  },
  {
    slug: "usb-c-dock",
    name: "USB-C Dock",
    price: 119,
    blurb:
      "One cable for dual 4K displays, gigabit ethernet, and 100W passthrough charging. Seven ports in a palm-sized body.",
    accent: "from-stone-200 to-stone-300",
  },
  {
    slug: "webcam",
    name: "Webcam",
    price: 69,
    blurb:
      "Sharp 1080p60 video with a privacy shutter and dual noise-reducing mics. Clips onto any laptop or monitor.",
    accent: "from-neutral-200 to-neutral-300",
  },
];

export function findProduct(slug: string): Product | undefined {
  return PRODUCTS.find((product) => product.slug === slug);
}

export const DEMO_GOAL =
  "Find Wireless Headphones, add them to the cart, open the cart, and continue toward checkout.";

export const CART_STORAGE_KEY = "orbit-store-cart";
