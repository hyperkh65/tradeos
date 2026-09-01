import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireAdminToolsUser } from '@/lib/admin-tools/auth';
import { detectVideoFormat, videoFormatToMime } from '@/lib/admin-tools/english-shorts/video-magic-bytes';
import { sha256 } from '@/lib/photos/hash';
import { buildSourcePath, uploadEnglishShortsFile } from '@/lib/admin-tools/english-shorts/storage';
import { insertSource, findSourceByHash, listSources } from '@/lib/admin-tools/english-shorts/db';
import { getEnglishShortsSettings } from '@/lib/admin-tools/english-shorts/settings';
import { probeFile } from '@/lib/admin-tools/english-shorts/ffmpeg-exec';
import { writeEnglishShortsAuditLog } from '@/lib/admin-tools/english-shorts/audit';
import { newId } from '@/lib/db/sqlite';

export const maxDuration = 300;

export async function GET() {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ sources: listSources() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminToolsUser();
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });

  const settings = getEnglishShortsSettings();
  if (file.size > settings.maxUploadSizeMb * 1024 * 1024) {
    return NextResponse.json({ error: `파일이 너무 큽니다 (최대 ${settings.maxUploadSizeMb}MB)` }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // 확장자만 믿지 않고 매직바이트로 실제 포맷 확인(요청서 15/50번)
  const fmt = detectVideoFormat(buf);
  if (!fmt) {
    return NextResponse.json({ error: '지원하지 않는 비디오 형식이거나 손상된 파일입니다' }, { status: 400 });
  }
  if (!settings.allowedExtensions.includes(fmt)) {
    return NextResponse.json({ error: `허용되지 않는 확장자입니다 (${fmt})` }, { status: 400 });
  }

  const hash = sha256(buf);
  const existing = findSourceByHash(hash);
  if (existing) {
    // 요청서 85번 — 같은 원본은 새로 저장하지 않고 기존 소스를 재사용한다.
    return NextResponse.json({ source: existing, duplicate: true });
  }

  // id를 먼저 발급해 NAS 저장 경로와 es_sources.id를 반드시 일치시킨다.
  const sourceId = newId();
  const nasPath = buildSourcePath(sourceId, file.name);
  const uploadRes = await uploadEnglishShortsFile(nasPath, buf, videoFormatToMime(fmt));
  if (!uploadRes.success || !uploadRes.path) {
    return NextResponse.json({ error: `NAS 저장 실패: ${uploadRes.error || '알 수 없는 오류'}` }, { status: 500 });
  }

  // ffprobe는 파일 경로가 필요해 임시파일에 잠깐 써서 메타데이터만 뽑고 지운다
  // (렌더링용 파일은 이미 NAS에 저장됐으니 이 임시파일은 probe 전용).
  const tmpPath = path.join(os.tmpdir(), `es-probe-${sourceId}.${fmt}`);
  let width: number | null = null, height: number | null = null, durationSec: number | null = null;
  let videoCodec: string | null = null, audioCodec: string | null = null;
  try {
    fs.writeFileSync(tmpPath, buf);
    const probe = await probeFile(tmpPath);
    if (probe) {
      const v = probe.streams.find(s => s.codec_type === 'video');
      const a = probe.streams.find(s => s.codec_type === 'audio');
      width = v?.width ?? null;
      height = v?.height ?? null;
      videoCodec = v?.codec_name ?? null;
      audioCodec = a?.codec_name ?? null;
      durationSec = probe.format.duration ? parseFloat(probe.format.duration) : null;
    }
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }

  const source = insertSource({
    sourceKind: 'upload',
    hash,
    originalFileName: file.name,
    storedPath: uploadRes.path,
    mimeType: videoFormatToMime(fmt),
    extension: fmt,
    fileSize: buf.length,
    width, height, durationSec, videoCodec, audioCodec,
    uploadedBy: user.id,
    uploadedByName: user.name,
  }, sourceId);

  writeEnglishShortsAuditLog({ sourceId: source.id, userId: user.id, userName: user.name, action: 'SOURCE_UPLOADED', after: { originalFileName: file.name, fileSize: buf.length }, req });

  return NextResponse.json({ source, duplicate: false }, { status: 201 });
}
