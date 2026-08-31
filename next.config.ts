import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  // pdf-parse/pdfjs-dist은 worker 파일 때문에 번들링하면 standalone에서 깨짐
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'imapflow', 'mailparser', 'nodemailer'],
  // Tauri 데스크톱 셸(src-tauri/target — Rust 빌드 산출물, 수백MB~수GB)이 output file
  // tracing에 잘못 딸려 들어가 .next/standalone이 비정상적으로 커지는 문제가 있었다
  // (DR 백업 용량 테스트 중 발견 — 배포할 때도 매번 이 용량을 NAS로 scp하고 있었다는 뜻이라
  // standalone과 무관한 이 두 폴더를 명시적으로 제외한다).
  outputFileTracingExcludes: {
    '/*': ['./src-tauri/**/*', './tauri-dist/**/*'],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['gw.ynk2014.com', 'localhost:3103'],
      bodySizeLimit: '200mb',
    },
  },
};

export default nextConfig;
