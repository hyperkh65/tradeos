import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { ZipArchive } from 'archiver';
import { getSessionUser } from '@/lib/auth/session';
import { getProfitAnalysisDocuments } from '@/lib/document-aggregator';

function safeSegment(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'file';
}

function guessExt(label: string): string {
  if (label.includes('Excel')) return '.xlsx';
  if (label.includes('PDF')) return '.pdf';
  return '';
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { files, context } = getProfitAnalysisDocuments(id);

  const archive = new ZipArchive({ zlib: { level: 6 } });
  const usedNames = new Set<string>();
  let added = 0;

  const uniqueName = (category: string, sourceLabel: string, label: string, ext: string) => {
    let entryName = `${safeSegment(category)}/${safeSegment(sourceLabel)}_${safeSegment(label)}${ext}`;
    let n = 2;
    while (usedNames.has(entryName)) {
      entryName = `${safeSegment(category)}/${safeSegment(sourceLabel)}_${safeSegment(label)}_${n}${ext}`;
      n++;
    }
    usedNames.add(entryName);
    return entryName;
  };

  for (const f of files) {
    if (f.diskPath) {
      if (!fs.existsSync(f.diskPath)) continue;
      const entryName = uniqueName(f.category, f.sourceLabel, f.label, path.extname(f.diskPath) || '');
      archive.file(f.diskPath, { name: entryName });
      added++;
    } else if (f.generate) {
      const buf = await f.generate().catch(() => null);
      if (!buf) continue;
      const entryName = uniqueName(f.category, f.sourceLabel, f.label, guessExt(f.label));
      archive.append(buf, { name: entryName });
      added++;
    }
  }

  if (added === 0) {
    archive.abort();
    return NextResponse.json({ error: '내려받을 파일이 없습니다.' }, { status: 404 });
  }

  archive.finalize();

  const zipName = `수익분석_${context.saleBizId || context.importBizId || id}_서류.zip`;
  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
