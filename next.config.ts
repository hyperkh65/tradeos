import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  // pdf-parse/pdfjs-dist은 worker 파일 때문에 번들링하면 standalone에서 깨짐
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'imapflow', 'mailparser', 'nodemailer'],
  experimental: {
    serverActions: {
      allowedOrigins: ['gw.ynk2014.com', 'localhost:3103'],
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;
