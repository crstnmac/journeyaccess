import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@axe-core/playwright",
    "axe-core",
  ],
  // The repo sits under a parent directory that also has a lockfile; pin the
  // tracing root so builds and dev servers resolve consistently.
  outputFileTracingRoot: path.resolve(__dirname),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // A separate build directory for the test server: two dev servers sharing
  // `.next` corrupts the webpack cache and makes journeys flaky.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The dev tools indicator adds a button to the accessibility tree, which
  // would show up as a candidate action in analyzed pages.
  devIndicators: false,
};

export default nextConfig;
