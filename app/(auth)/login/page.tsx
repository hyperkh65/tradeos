'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { loginAction } from './actions';

function CorosLogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" className={className}>
      {/* Outer orbit ring — open on right = C shape */}
      <circle cx="18" cy="18" r="13" stroke="white" strokeWidth="2.8" strokeLinecap="round"
        strokeDasharray="60 22" strokeDashoffset="10" />
      {/* Inner ring */}
      <circle cx="18" cy="18" r="7" stroke="white" strokeWidth="2" strokeLinecap="round"
        strokeDasharray="28 16" strokeDashoffset="5" strokeOpacity="0.6" />
      {/* Center dot */}
      <circle cx="18" cy="18" r="3" fill="white" />
      {/* Node dots on outer ring */}
      <circle cx="18" cy="5" r="2" fill="white" fillOpacity="0.9" />
      <circle cx="4.7" cy="26" r="1.5" fill="white" fillOpacity="0.7" />
      <circle cx="31.3" cy="26" r="1.5" fill="white" fillOpacity="0.7" />
    </svg>
  );
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, { error: '' });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
            <CorosLogoMark className="w-9 h-9" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Coros</h1>
          <p className="text-sm text-muted-foreground mt-1">무역회사 통합 그룹웨어</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">로그인</h2>
          <form action={formAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">이메일</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="이메일 주소 입력"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="비밀번호 입력"
                required
              />
            </div>
            {state.error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : '로그인'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-primary hover:underline font-medium">회원 가입</Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2026 Coros. All rights reserved.
        </p>
      </div>
    </div>
  );
}
