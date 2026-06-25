import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // canvas has native C++ bindings — let Node load it at runtime
  serverExternalPackages: ["canvas"],
};

export default nextConfig;