import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  // pdf-parse/pdfjs-dist은 worker 파일 때문에 번들링하면 standalone에서 깨짐
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'imapflow', 'mailparser', 'nodemailer'],
  // serverExternalPackages로 번들링은 피했지만, standalone 빌드의 파일 추적기(@vercel/nft)가
  // pdf-parse 내부에서 런타임에 동적으로 require하는 워커 파일(pdf.worker.mjs)까지는 정적
  // 분석으로 찾아내지 못해 .next/standalone/node_modules에서 빠지는 문제가 실사용 중 발견됨
  // (프로덕션에서만 "Cannot find module '.../pdf.worker.mjs'" 오류로 재현, 로컬 next dev는
  // 전체 node_modules를 그대로 쓰므로 재현이 안 됐음). pdf-parse를 쓰는 모든 라우트에
  // 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    '/*': ['./node_modules/pdf-parse/dist/pdf-parse/cjs/*.mjs'],
  },
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
