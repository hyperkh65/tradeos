import { NextRequest, NextResponse } from 'next/server';
import { requireAdminToolsUser, requireAdminToolsManager } from '@/lib/admin-tools/auth';
import { getEnglishShortsSettings, updateEnglishShortsSettings, type EnglishShortsSettings } from '@/lib/admin-tools/english-shorts/settings';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';

export async function GET() {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ settings: getEnglishShortsSettings() });
}

const NUMBER_KEYS = [
  'maxUploadSizeMb', 'maxClipsPerProject', 'maxRenderConcurrency', 'renderStaleProcessingMinutes',
  'renderMaxAttempts', 'outputFps', 'outputVideoBitrateK', 'outputAudioBitrateK',
] as const;

export async function PUT(req: NextRequest) {
  const auth = await requireAdminToolsManager();
  if (!auth.ok) return auth.response;
  const { user } = auth;
  const body = await req.json().catch(() => ({}));
  const before = getEnglishShortsSettings();

  const patch: Partial<EnglishShortsSettings> = {};
  for (const key of NUMBER_KEYS) {
    if (typeof body[key] === 'number' && Number.isFinite(body[key]) && body[key] > 0) {
      patch[key] = body[key];
    }
  }
  if (Array.isArray(body.allowedExtensions)) {
    const exts = body.allowedExtensions.filter((e: unknown) => typeof e === 'string' && e.trim()).map((e: string) => e.trim().toLowerCase());
    if (exts.length > 0) patch.allowedExtensions = exts;
  }
  if (typeof body.ffmpegContainer === 'string' && body.ffmpegContainer.trim()) patch.ffmpegContainer = body.ffmpegContainer.trim();
  if (typeof body.getyarnSearchBaseUrl === 'string' && body.getyarnSearchBaseUrl.trim()) patch.getyarnSearchBaseUrl = body.getyarnSearchBaseUrl.trim();

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: '변경할 값이 없습니다' }, { status: 400 });

  updateEnglishShortsSettings(patch, user.id);
  const after = getEnglishShortsSettings();
  writeEnglishShortsAuditLog({ userId: user.id, userName: user.name, action: 'SETTINGS_CHANGED', before, after, req });

  return NextResponse.json({ settings: after });
}
