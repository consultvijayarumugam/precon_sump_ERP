import type { NextConfig } from "next";

// Where this web server forwards /api/v1/* requests. The browser only ever
// talks to the web app (same origin), so phones on the LAN need no API URL
// and no CORS. Default: the API on this same machine.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiProxyTarget}/api/v1/:path*` }];
  },
  // LOCAL-NETWORK TESTING ONLY (`next dev`): let phones/laptops on the same
  // Wi-Fi load dev assets via the Mac's private IP. Covers the usual home/office
  // ranges so it keeps working when the IP changes. No effect on production builds.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
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
