'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { loginAction } from './actions';
import { LogoMark } from '@/components/brand/logo-mark';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, { error: '' });
  const [brand, setBrand] = useState({ appName: 'YNK 그룹웨어', logoText: 'YnK' });

  useEffect(() => {
    fetch('/api/settings/brand').then(r => r.json()).then(j => { if (j.data) setBrand(j.data); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 shadow-lg shadow-primary/25 rounded-2xl">
            <LogoMark text={brand.logoText} size={64} />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{brand.appName}</h1>
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
          © 2026 {brand.appName}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
