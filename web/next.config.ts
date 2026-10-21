import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the dev-only "N" badge away from the sidebar's bottom-left controls.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // The signed-in app renders client-side after a browser token check, so only
    // validate instant navigation on segments that opt in with `export const instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
