import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'tradeos-fallback-secret-change-in-production'
);

const PUBLIC_PATHS = [
  '/login', '/signup', '/api/auth/login', '/api/auth/signup', '/api/settings/brand',
  // PWA 설치 가능성(installability)을 위한 정적 자산 — 로그인 전(로그인 화면 자체)에도
  // 매니페스트/서비스워커/아이콘이 열려야 설치 프롬프트가 동작한다.
  '/manifest.webmanifest', '/sw.js', '/icons',
  // 중국 공급업체 자료요청 외부 작성 화면 — 그룹웨어 로그인 없이 토큰 링크로만 접근.
  // 보안은 여기서 끝나지 않고, 각 라우트가 매 요청마다 토큰을 해시해 DB에서 재검증한다
  // (lib/supplier-form/token.ts의 resolveProjectByToken). 이 prefix는 "누구나 화면은 열 수 있다"만
  // 의미하고, 실제 데이터 접근 여부는 라우트 핸들러가 결정한다.
  '/supplier-form', '/api/supplier-form',
  // 제품 승인서·사양서 외부 작성 화면 — 동일한 토큰 기반 보안 정책(lib/approval-doc/token.ts).
  '/approval-form', '/api/approval-form',
  // Tauri 데스크톱 셸이 창을 띄우기 전(로그인 전)에 서버 URL을 조회하는 엔드포인트.
  '/api/desktop/bootstrap',
];
// 다운로드된 문서(Word 등)가 세션 쿠키 없이도 첨부 이미지를 불러올 수 있도록 개별 파일 서빙 경로만 공개
const PUBLIC_PATTERNS = [/^\/api\/documents\/[^/]+\/files\/[^/]+\/[^/]+$/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || PUBLIC_PATTERNS.some((re) => re.test(pathname))) {
    return NextResponse.next();
  }

  const token = req.cookies.get('tradeos_session')?.value;
  const isApi = pathname.startsWith('/api/');

  if (!token) {
    if (isApi) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    if (isApi) return NextResponse.json({ error: '세션이 만료되었습니다' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth/login|api/auth/signup).*)'],
};
