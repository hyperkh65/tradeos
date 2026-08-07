import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { User } from '@/types';

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'tradeos-fallback-secret-change-in-production'
);

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
