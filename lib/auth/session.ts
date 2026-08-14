import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from '@/types';

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error('[SECURITY] AUTH_SECRET 환경변수가 설정되지 않았습니다. 운영 배포 전 반드시 설정하세요.');
}
const SECRET = new TextEncoder().encode(AUTH_SECRET ?? 'tradeos-fallback-CHANGE-IN-PRODUCTION');

export async function createSession(user: User): Promise<string> {
  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(SECRET);
  return token;
}

export async function verifySession(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload as { user: User }).user;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('tradeos_session')?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAuth(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export function hasPermission(user: User, permission: string): boolean {
  if (user.role === 'admin') return true;
  return user.permissions.includes(permission);
}
