import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone with a minimal server.js and only the traced
  // node_modules files, which is what the Dockerfile runner stage copies.
  output: "standalone",
};

export default nextConfig;
