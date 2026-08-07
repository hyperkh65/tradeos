import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete('tradeos_session');
  return res;
}
