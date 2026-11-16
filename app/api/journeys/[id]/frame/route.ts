import { getRunPage } from "@/lib/journeys/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live frame stream for a running journey.
 *
 * The journey runner keeps its Playwright page in memory; this endpoint grabs
 * a JPEG frame on demand. The client polls it a few times per second, which is
 * enough to watch the browser act without a screencast protocol. A missing
 * page or a mid-navigation screenshot returns 204 so the client keeps the
 * previous frame.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const page = getRunPage(id);
  if (!page || page.isClosed()) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
}
