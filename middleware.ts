import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'tradeos-fallback-secret-change-in-production'
);

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth/login', '/api/auth/signup', '/api/settings/brand'];
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
