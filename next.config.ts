import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Turbopack server config: externalize native/problematic modules
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    resolveAlias: {
      // Force pdf-parse to be resolved as external
    },
  },
};

export default nextConfig;