import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  experimental: {
    serverActions: {
      allowedOrigins: ['gw.ynk2014.com', 'localhost:3103'],
    },
  },
};

export default nextConfig;
