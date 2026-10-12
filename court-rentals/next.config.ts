import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a repo that has another Next.js app at its root. Without this,
  // Next infers the repo root as the workspace and picks up the other app's files.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
