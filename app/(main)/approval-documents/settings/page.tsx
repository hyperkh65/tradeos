'use client';
import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Palette, Loader2, Plus, X, Upload } from 'lucide-react';

interface BrandProfile {
  id: string; name: string; companyNameKo?: string; primaryColor?: string; footerText?: string; logoUrl?: string | null;
  watermarkUrl?: string | null; watermarkOpacity?: number;
}

function CreateProfileModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', companyNameKo: '', primaryColor: '#1D4ED8', footerText: '', fromCompanySettings: true });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) { alert('프로필 이름은 필수입니다.'); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/approval-documents/brand-profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '생성 실패'); return; }
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">브랜드 프로필 생성</span>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); submit(); }} onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }} className="p-4 space-y-3">
          <div><label className="text-xs text-muted-foreground mb-1 block">프로필 이름 *</label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="예: 기본 브랜드" /></div>
          <div><label className="text-xs text-muted-foreground mb-1 block">회사명(표지 표시용)</label><Input value={form.companyNameKo} onChange={e => setForm(f => ({ ...f, companyNameKo: e.target.value }))} /></div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">강조색</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="h-10 w-14 border rounded" />
              <Input value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="flex-1" />
            </div>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">문서 하단 저작권 문구</label><Input value={form.footerText} onChange={e => setForm(f => ({ ...f, footerText: e.target.value }))} placeholder="예: Confidential - (주)와이엔케이" /></div>
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={form.fromCompanySettings} onChange={e => setForm(f => ({ ...f, fromCompanySettings: e.target.checked }))} />
            현재 회사설정(로고 등)에서 초기값 가져오기
          </label>
          <p className="text-xs text-muted-foreground">로고는 프로필 생성 후 목록에서 업로드할 수 있습니다. 인쇄 품질을 위해 투명 배경의 고해상도 로고를 권장합니다. 권장 해상도는 가로 1,000px 이상 또는 벡터 SVG 파일입니다.</p>
        </form>
        <div className="p-4 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '생성'}</Button>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalDocSettingsPage() {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadingWatermarkId, setUploadingWatermarkId] = useState<string | null>(null);
  const [opacityDraft, setOpacityDraft] = useState<Record<string, number>>({});

  const load = () => {
    setLoading(true);
    fetch('/api/approval-documents/brand-profiles').then(r => r.json()).then(j => setProfiles(j.data || [])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const uploadLogo = async (profileId: string, file: File) => {
    setUploadingId(profileId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`/api/approval-documents/brand-profiles/${profileId}/logo`, { method: 'POST', body: formData });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '업로드 실패'); return; }
      if (j.data?.warning) alert(j.data.warning);
      load();
    } finally { setUploadingId(null); }
  };

  const uploadWatermark = async (profileId: string, file: File) => {
    setUploadingWatermarkId(profileId);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`/api/approval-documents/brand-profiles/${profileId}/watermark`, { method: 'POST', body: formData });
      const j = await r.json();
      if (!r.ok) { alert(j.error || '업로드 실패'); return; }
      load();
    } finally { setUploadingWatermarkId(null); }
  };

  const removeWatermark = async (profileId: string) => {
    await fetch(`/api/approval-documents/brand-profiles/${profileId}/watermark`, { method: 'DELETE' });
    load();
  };

  const saveOpacity = async (profileId: string, opacity: number) => {
    await fetch(`/api/approval-documents/brand-profiles/${profileId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watermarkOpacity: opacity }),
    });
    load();
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="제품 승인서 — 브랜드/템플릿 설정" icon={<Palette className="w-5 h-5" />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4 max-w-3xl mx-auto w-full">
        <div className="flex justify-end">
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" />브랜드 프로필 생성</Button>
        </div>
        <div className="bg-card border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">등록된 브랜드 프로필이 없습니다. 프로필을 만들지 않으면 승인서는 기본(무채색) 스타일로 생성됩니다.</p>
          ) : (
            <div className="divide-y">
              {profiles.map(p => (
                <div key={p.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    {p.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.logoUrl} alt="" className="w-10 h-10 object-contain border rounded bg-white shrink-0" />
                    ) : (
                      <span className="w-5 h-5 rounded-full border shrink-0" style={{ background: p.primaryColor || '#ccc' }} />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.companyNameKo || '-'}{p.footerText ? ` · ${p.footerText}` : ''}</div>
                    </div>
                    <label className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer shrink-0">
                      {uploadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {p.logoUrl ? '로고 교체' : '로고 업로드'}
                      <input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" disabled={uploadingId === p.id}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(p.id, f); e.target.value = ''; }} />
                    </label>
                  </div>
                  <div className="flex items-center gap-3 pl-[52px]">
                    {p.watermarkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.watermarkUrl} alt="" className="w-8 h-8 object-contain border rounded bg-white shrink-0 opacity-60" />
                    ) : (
                      <span className="w-8 h-8 border rounded shrink-0 flex items-center justify-center text-[9px] text-muted-foreground">없음</span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0 w-16">워터마크</span>
                    <label className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer shrink-0">
                      {uploadingWatermarkId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {p.watermarkUrl ? '교체' : '업로드'}
                      <input type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" disabled={uploadingWatermarkId === p.id}
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadWatermark(p.id, f); e.target.value = ''; }} />
                    </label>
                    {p.watermarkUrl && (
                      <>
                        <button className="text-xs text-muted-foreground hover:underline shrink-0" onClick={() => removeWatermark(p.id)}>제거</button>
                        <div className="flex items-center gap-1.5 flex-1 max-w-[180px]">
                          <input
                            type="range" min={0.02} max={0.5} step={0.02}
                            value={opacityDraft[p.id] ?? p.watermarkOpacity ?? 0.08}
                            onChange={e => setOpacityDraft(d => ({ ...d, [p.id]: Number(e.target.value) }))}
                            onMouseUp={() => saveOpacity(p.id, opacityDraft[p.id] ?? p.watermarkOpacity ?? 0.08)}
                            onTouchEnd={() => saveOpacity(p.id, opacityDraft[p.id] ?? p.watermarkOpacity ?? 0.08)}
                            className="flex-1"
                          />
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round((opacityDraft[p.id] ?? p.watermarkOpacity ?? 0.08) * 100)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">템플릿 3종(정식 승인서형/기술 사양서형/간결한 제품 사양서형)은 기본 제공되며, 프로젝트 생성 시 선택할 수 있습니다.</p>
      </div>
      {createOpen && <CreateProfileModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />}
    </div>
  );
}
