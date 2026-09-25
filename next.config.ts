import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Spreadsheet uploads (CSV/XLSX buy lists and supplier catalogs) go through a server action.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
