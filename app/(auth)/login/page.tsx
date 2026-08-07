'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Globe, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '로그인에 실패했습니다.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mb-3 shadow-lg shadow-primary/25">
            <Globe className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">TradeOS</h1>
          <p className="text-sm text-muted-foreground mt-1">무역 그룹웨어</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-5">로그인</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">이메일</Label>
              <Input
                id="email"
                type="email"
                placeholder="이메일 주소 입력"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">비밀번호</Label>
              <Input
                id="password"
                type="password"
                placeholder="비밀번호 입력"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '로그인'}
            </Button>
          </form>

          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
            <p className="text-xs text-center text-muted-foreground mt-4 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
              🔔 데모 모드 — 아무 이메일/비밀번호로 로그인 가능합니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
