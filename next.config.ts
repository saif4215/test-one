import type { NextConfig } from "next";

const privateHeaders = [
  // Signing links carry a secret token, so never leak them in a Referer header or cache them.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  // The Docker image builds a self-contained server (NEXT_OUTPUT=standalone). Local `npm start` uses the normal build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    // The proxy buffers request bodies and silently truncates anything over its limit (default 10 MB),
    // so keep it at least as large as the server-action limit or large uploads would be cut short.
    proxyClientMaxBodySize: "26mb",
    serverActions: {
      // Spreadsheet uploads (CSV/XLSX buy lists and supplier catalogs) and agreement attachments (up to 10 MB each) go through server actions.
      bodySizeLimit: "26mb",
    },
  },
  async headers() {
    return [
      { source: "/agreements/:path*", headers: privateHeaders },
      { source: "/sign/:path*", headers: privateHeaders },
      { source: "/:path*", headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] },
    ];
  },
};

export default nextConfig;
