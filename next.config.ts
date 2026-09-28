import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image builds a self-contained server (NEXT_OUTPUT=standalone). Local `npm start` uses the normal build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  experimental: {
    serverActions: {
      // Spreadsheet uploads (CSV/XLSX buy lists and supplier catalogs) go through a server action.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
