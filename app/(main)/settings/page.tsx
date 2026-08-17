'use client';

import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, User, Key, Database, Building2, RefreshCw, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'profile' | 'company' | 'notion' | 'security';

interface CompanySettings {
  name: string; ceo: string; bizNo: string; bizType: string; bizItem: string;
  address: string; tel: string; fax: string; email: string;
  bank: string; bankForeign1: string; bankForeign2: string;
  logoUrl: string; stampUrl: string; ship24ApiKey: string;
  unipassApiKey: string; unipassApiKey2: string; unipassApiKey3: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');
  const [user, setUser] = useState<{ name: string; email: string; department: string; role: string } | null>(null);
  const [profile, setProfile] = useState({ name: '', department: '' });
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [company, setCompany] = useState<CompanySettings>({
    name: '', ceo: '', bizNo: '', bizType: '', bizItem: '',
    address: '', tel: '', fax: '', email: '',
    bank: '', bankForeign1: '', bankForeign2: '',
    logoUrl: '', stampUrl: '', ship24ApiKey: '',
    unipassApiKey: '', unipassApiKey2: '', unipassApiKey3: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notion DB check/create state
  const [notionCheckResult, setNotionCheckResult] = useState<Record<string, { set: boolean; reachable?: boolean; error?: string }> | null>(null);
  const [notionChecking, setNotionChecking] = useState(false);
  const [notionParentPageId, setNotionParentPageId] = useState('');
  const [notionCreating, setNotionCreating] = useState(false);
  const [notionCreateResult, setNotionCreateResult] = useState<{ results?: Record<string, { id: string; url: string; secret: string }>; errors?: Record<string, string>; commands?: string[] } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => {
      if (j.user) { setUser(j.user); setProfile({ name: j.user.name, department: j.user.department ?? '' }); }
    });
    fetch('/api/settings/company').then(r => r.json()).then(j => {
      if (j.data) setCompany(j.data);
    });
  }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch('/api/auth/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
      const j = await res.json();
      if (res.ok) showMsg('success', '프로필이 저장됐습니다.'); else showMsg('error', j.error ?? '오류가 발생했습니다.');
    } finally { setSaving(false); }
  };

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const res = await fetch('/api/settings/company', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(company) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) showMsg('success', '회사정보가 저장됐습니다.');
      else showMsg('error', j.error ? `저장 오류: ${j.error}` : `저장 오류 (HTTP ${res.status})`);
    } catch (err) {
      showMsg('error', `네트워크 오류: ${String(err)}`);
    } finally { setSaving(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.next !== passwords.confirm) { showMsg('error', '새 비밀번호가 일치하지 않습니다.'); return; }
    if (passwords.next.length < 8) { showMsg('error', '비밀번호는 8자 이상이어야 합니다.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: passwords.current, next: passwords.next }) });
      const j = await res.json();
      if (res.ok) { showMsg('success', '비밀번호가 변경됐습니다.'); setPasswords({ current: '', next: '', confirm: '' }); }
      else showMsg('error', j.error ?? '오류가 발생했습니다.');
    } finally { setSaving(false); }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: '프로필', icon: <User className="w-4 h-4" /> },
    { id: 'company', label: '회사정보', icon: <Building2 className="w-4 h-4" /> },
    { id: 'security', label: '보안', icon: <Key className="w-4 h-4" /> },
    { id: 'notion', label: 'Notion 연동', icon: <Database className="w-4 h-4" /> },
  ];

  const checkNotionDbs = async () => {
    setNotionChecking(true);
    try {
      const res = await fetch('/api/setup/notion-check');
      const j = await res.json();
      setNotionCheckResult(j.databases || {});
    } catch { /* ignore */ } finally { setNotionChecking(false); }
  };

  const createNotionDbs = async () => {
    if (!notionParentPageId.trim()) { showMsg('error', 'Notion 부모 페이지 ID를 입력하세요'); return; }
    setNotionCreating(true);
    try {
      const res = await fetch('/api/setup/create-notion-dbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPageId: notionParentPageId.trim() }),
      });
      const j = await res.json();
      if (res.ok) { setNotionCreateResult(j); await checkNotionDbs(); }
      else showMsg('error', j.error || 'DB 생성 실패');
    } catch (e) { showMsg('error', String(e)); } finally { setNotionCreating(false); }
  };

  const NOTION_FIELDS = [
    { key: 'NOTION_TOKEN', label: 'Notion API 토큰', placeholder: 'secret_xxxxxxxxxxxxxxxxxxxx', desc: 'Notion Integrations에서 발급' },
    { key: 'NOTION_DB_COMPANIES', label: '거래처 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_PRODUCTS', label: '제품 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_TASKS', label: '업무 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_PURCHASE_ORDERS', label: '발주 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_INSPECTIONS', label: '검품 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_SHIPMENTS', label: '선적 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_CLAIMS', label: '클레임 DB ID', placeholder: '32자리 Notion 페이지 ID' },
    { key: 'NOTION_DB_EXPENSES', label: '비용 DB ID', placeholder: '32자리 Notion 페이지 ID' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppHeader title="설정" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto">

          {msg && (
            <div className={cn('mb-4 px-4 py-2.5 rounded-lg text-sm flex items-center gap-2', msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
              {msg.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}{msg.text}
            </div>
          )}

          <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap', tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <form onSubmit={saveProfile} className="space-y-4">
              <h2 className="font-semibold text-base">프로필 정보</h2>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">이메일</label>
                <Input value={user?.email ?? ''} disabled className="bg-muted/50" />
                <p className="text-xs text-muted-foreground mt-1">이메일은 변경할 수 없습니다.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">역할</label>
                <Input value={user?.role ?? ''} disabled className="bg-muted/50" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">이름 *</label>
                <Input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">부서</label>
                <Input value={profile.department} onChange={e => setProfile(p => ({ ...p, department: e.target.value }))} placeholder="수출팀" />
              </div>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}</Button>
            </form>
          )}

          {tab === 'company' && (
            <form onSubmit={saveCompany} className="space-y-4">
              <h2 className="font-semibold text-base">회사 기초 정보</h2>
              <p className="text-xs text-muted-foreground">견적서, 발주서 등 출력 문서에 자동으로 입력됩니다.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">회사명 *</label>
                  <Input value={company.name} onChange={e => setCompany(c => ({ ...c, name: e.target.value }))} placeholder="(주)와이엔케이" required />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">대표자</label>
                  <Input value={company.ceo} onChange={e => setCompany(c => ({ ...c, ceo: e.target.value }))} placeholder="홍길동" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">사업자번호</label>
                  <Input value={company.bizNo} onChange={e => setCompany(c => ({ ...c, bizNo: e.target.value }))} placeholder="000-00-00000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">업태</label>
                  <Input value={company.bizType} onChange={e => setCompany(c => ({ ...c, bizType: e.target.value }))} placeholder="도소매" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">종목</label>
                  <Input value={company.bizItem} onChange={e => setCompany(c => ({ ...c, bizItem: e.target.value }))} placeholder="상품중개업" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">이메일</label>
                  <Input value={company.email} onChange={e => setCompany(c => ({ ...c, email: e.target.value }))} placeholder="global@company.com" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">주소</label>
                <Input value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} placeholder="인천시 미추홀구..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">전화</label>
                  <Input value={company.tel} onChange={e => setCompany(c => ({ ...c, tel: e.target.value }))} placeholder="032-000-0000" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">팩스</label>
                  <Input value={company.fax} onChange={e => setCompany(c => ({ ...c, fax: e.target.value }))} placeholder="032-000-0000" />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">입금 계좌</h3>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">국내 계좌</label>
                  <textarea value={company.bank} onChange={e => setCompany(c => ({ ...c, bank: e.target.value }))}
                    rows={2} placeholder="하나은행 000-000-000 (주)회사명" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">해외 계좌 1 (SWIFT)</label>
                  <textarea value={company.bankForeign1} onChange={e => setCompany(c => ({ ...c, bankForeign1: e.target.value }))}
                    rows={3} placeholder="SHINHAN BANK&#10;000-000-000&#10;SWIFT CODE: XXXXXXXX&#10;COMPANY NAME LTD" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none font-mono text-xs" />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">해외 계좌 2 (선택)</label>
                  <textarea value={company.bankForeign2} onChange={e => setCompany(c => ({ ...c, bankForeign2: e.target.value }))}
                    rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none font-mono text-xs" />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-1">로고 / 직인</h3>
                <p className="text-xs text-muted-foreground mb-3">견적서·청구서·인보이스 출력 시 자동으로 삽입됩니다.</p>
                <div className="grid grid-cols-2 gap-4">
                  {(['logo', 'stamp'] as const).map(type => {
                    const urlKey = type === 'logo' ? 'logoUrl' : 'stampUrl';
                    const label = type === 'logo' ? '회사 로고' : '직인 (도장)';
                    const currentUrl = company[urlKey];
                    return (
                      <div key={type}>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
                        <div className="border-2 border-dashed border-border rounded-lg p-3 flex flex-col items-center gap-2 bg-muted/20 relative">
                          {currentUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={currentUrl} alt={label} className="max-h-20 max-w-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                              <span className="text-xs text-green-600 font-medium">등록됨</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground py-4">미등록</span>
                          )}
                          <label className="cursor-pointer text-xs text-primary font-medium hover:underline">
                            {currentUrl ? '이미지 교체' : '이미지 업로드'}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const fd = new FormData();
                                fd.append('type', type);
                                fd.append('file', file);
                                setSaving(true);
                                try {
                                  const res = await fetch('/api/settings/company/upload', { method: 'POST', body: fd });
                                  const j = await res.json();
                                  if (j.url) {
                                    setCompany(c => ({ ...c, [urlKey]: j.url }));
                                    showMsg('success', `${label} 업로드 완료`);
                                  } else {
                                    showMsg('error', j.error ?? '업로드 실패');
                                  }
                                } catch { showMsg('error', '업로드 오류'); }
                                finally { setSaving(false); e.target.value = ''; }
                              }}
                            />
                          </label>
                          {currentUrl && (
                            <button
                              type="button"
                              onClick={() => setCompany(c => ({ ...c, [urlKey]: '' }))}
                              className="text-xs text-red-500 hover:underline"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* External Integrations */}
              <div className="border-t pt-4 space-y-4">
                <h3 className="text-sm font-semibold">외부 서비스 연동 (B/L 자동조회)</h3>

                {/* 관세청 유니패스 - 무료 */}
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-green-700">★ 관세청 유니패스 (무료 · 추천)</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">한국 수입 화물 전체 조회</span>
                  </div>
                  <p className="text-xs text-green-700">
                    unipass.customs.go.kr → 회원가입 → 마이페이지 → OpenAPI 신청.<br />
                    <span className="font-medium">서비스별로 키가 다릅니다</span> — 각각 별도 신청 후 발급된 키를 입력하세요.
                  </p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">① 화물통관진행정보조회 API Key</label>
                      <Input
                        type="password"
                        value={company.unipassApiKey}
                        onChange={e => setCompany(c => ({ ...c, unipassApiKey: e.target.value }))}
                        placeholder="cargoCsclPrgsInfoQry 서비스 인증키"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">② 컨테이너내역조회 API Key</label>
                      <Input
                        type="password"
                        value={company.unipassApiKey2}
                        onChange={e => setCompany(c => ({ ...c, unipassApiKey2: e.target.value }))}
                        placeholder="cntrInfoQry 서비스 인증키 (미입력 시 ①키 사용)"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">③ 입항보고내역조회 API Key</label>
                      <Input
                        type="password"
                        value={company.unipassApiKey3}
                        onChange={e => setCompany(c => ({ ...c, unipassApiKey3: e.target.value }))}
                        placeholder="arrivRptInfoQry 서비스 인증키 (미입력 시 ①키 사용)"
                      />
                    </div>
                  </div>
                </div>

                {/* Ship24 - 유료 */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">Ship24 (유료 · 글로벌)</span>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">해외 발송 포함 전 세계</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    관세청으로 조회 안 되는 경우 보조로 사용. 유료 플랜 필요.
                  </p>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Ship24 API Key</label>
                    <Input
                      type="password"
                      value={company.ship24ApiKey}
                      onChange={e => setCompany(c => ({ ...c, ship24ApiKey: e.target.value }))}
                      placeholder="Apic-Key xxxxxxxxxxxx"
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}</Button>
            </form>
          )}

          {tab === 'security' && (
            <form onSubmit={changePassword} className="space-y-4">
              <h2 className="font-semibold text-base">비밀번호 변경</h2>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">현재 비밀번호</label>
                <Input type="password" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} placeholder="••••••••" required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">새 비밀번호 (8자 이상)</label>
                <Input type="password" value={passwords.next} onChange={e => setPasswords(p => ({ ...p, next: e.target.value }))} placeholder="••••••••" required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">새 비밀번호 확인</label>
                <Input type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" required />
              </div>
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '비밀번호 변경'}</Button>
            </form>
          )}

          {tab === 'notion' && (
            <div className="space-y-4">
              <h2 className="font-semibold text-base">Notion 연동 설정</h2>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
                <p className="font-medium">설정 방법</p>
                <ol className="list-decimal ml-4 space-y-1 text-xs">
                  <li>notion.so/my-integrations 에서 Integration 생성 → API 토큰 복사</li>
                  <li>각 Notion DB 페이지를 열고 Integration 연결 (⋯ → 연결 → 방금 만든 것 선택)</li>
                  <li>DB 페이지 URL의 32자리 ID 복사</li>
                  <li>아래 값을 서버 환경변수에 설정 후 재배포</li>
                </ol>
              </div>
              <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">GitHub Secrets 또는 서버 환경변수에 설정하세요</p>
                {NOTION_FIELDS.map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-mono font-medium">{f.key}</label>
                    <Input value="" readOnly placeholder={f.label} className="bg-background font-mono text-xs" />
                    {f.desc && <p className="text-xs text-muted-foreground">{f.desc}</p>}
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                현재는 SQLite 로컬 저장 모드입니다. Notion 환경변수 설정 후 재배포하면 Notion이 Primary DB로 동작합니다.
              </div>

              {/* DB 연동 상태 확인 */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Notion DB 연동 상태</h3>
                  <Button type="button" variant="outline" size="sm" onClick={checkNotionDbs} disabled={notionChecking}>
                    {notionChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                    상태 확인
                  </Button>
                </div>

                {notionCheckResult && (
                  <div className="bg-muted/40 rounded-xl p-3 space-y-1.5">
                    {Object.entries(notionCheckResult).map(([label, status]) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className={cn('font-medium', status.reachable ? 'text-green-600' : status.set ? 'text-yellow-600' : 'text-red-500')}>
                          {status.reachable ? '✅ 연결됨' : status.set ? `⚠️ 오류: ${status.error || ''}` : '❌ 미설정'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 누락된 DB 자동 생성 */}
                {notionCheckResult && Object.values(notionCheckResult).some(s => !s.set) && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-blue-800">누락된 DB 자동 생성</p>
                    <p className="text-xs text-blue-700">
                      Notion에서 TradeOS 통합 앱이 연결된 페이지 ID를 입력하면, 클레임/검품 DB를 자동으로 생성합니다.
                    </p>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        부모 페이지 ID (Notion URL의 32자리)
                      </label>
                      <Input
                        value={notionParentPageId}
                        onChange={e => setNotionParentPageId(e.target.value)}
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground mt-1">예: notion.so/TradeOS-ABC123... 에서 ABC123... 부분</p>
                    </div>
                    <Button type="button" onClick={createNotionDbs} disabled={notionCreating || !notionParentPageId.trim()} size="sm">
                      {notionCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PlusCircle className="w-3.5 h-3.5 mr-1" />}
                      DB 자동 생성
                    </Button>
                  </div>
                )}

                {/* 생성 결과 + gh secret set 명령어 */}
                {notionCreateResult && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-green-800">생성 완료! 아래 명령어를 터미널에서 실행하세요</p>
                    {notionCreateResult.results && Object.entries(notionCreateResult.results).map(([name, r]) => (
                      <div key={name} className="space-y-1">
                        <p className="text-xs font-medium text-green-700">{name}: <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline">{r.id}</a></p>
                      </div>
                    ))}
                    {notionCreateResult.commands && (
                      <div className="bg-gray-900 rounded-lg p-3 space-y-1">
                        {notionCreateResult.commands.map((cmd, i) => (
                          <p key={i} className="text-xs font-mono text-green-400 break-all">{cmd}</p>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-green-700">명령어 실행 후 GitHub Actions에서 재배포하세요.</p>
                    {notionCreateResult.errors && Object.keys(notionCreateResult.errors).length > 0 && (
                      <div className="text-xs text-red-600 space-y-1">
                        {Object.entries(notionCreateResult.errors).map(([name, err]) => (
                          <p key={name}><span className="font-medium">{name}</span>: {err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
