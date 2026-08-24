'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { LogoMark } from '@/components/brand/logo-mark';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '', department: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');
  const [brand, setBrand] = useState({ appName: 'YNK 그룹웨어', logoText: 'YnK' });

  useEffect(() => {
    fetch('/api/settings/brand').then(r => r.json()).then(j => { if (j.data) setBrand(j.data); }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password, department: form.department }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '가입에 실패했습니다.');
      } else {
        setDoneMsg(data.message);
        setDone(true);
        if (data.status === 'approved') {
          setTimeout(() => router.push('/login'), 2000);
        }
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50/30 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 shadow-lg shadow-primary/20 rounded-2xl">
            <LogoMark text={brand.logoText} size={56} />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{brand.appName}</h1>
          <p className="text-sm text-muted-foreground mt-1">무역회사 통합 그룹웨어</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="font-semibold text-foreground mb-2">가입 신청 완료</p>
              <p className="text-sm text-muted-foreground">{doneMsg}</p>
              <Button className="mt-6 w-full" onClick={() => router.push('/login')}>
                로그인으로 이동
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-5">회원 가입</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">이름 *</Label>
                  <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="홍길동" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">이메일 *</Label>
                  <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="department">부서</Label>
                  <Input id="department" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="수출팀" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">비밀번호 * <span className="text-xs text-muted-foreground">(8자 이상)</span></Label>
                  <Input id="password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="passwordConfirm">비밀번호 확인 *</Label>
                  <Input id="passwordConfirm" type="password" value={form.passwordConfirm} onChange={e => setForm(f => ({ ...f, passwordConfirm: e.target.value }))} placeholder="••••••••" required />
                </div>

                {error && <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '가입 신청'}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                이미 계정이 있나요?{' '}
                <Link href="/login" className="text-primary hover:underline font-medium">로그인</Link>
              </p>
              <p className="text-center text-xs text-muted-foreground mt-3 bg-muted/50 rounded-lg px-3 py-2">
                최초 가입자는 자동으로 관리자가 됩니다.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
