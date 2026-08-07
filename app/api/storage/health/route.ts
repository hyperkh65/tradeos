import { NextResponse } from 'next/server';
import { nasHealthCheck } from '@/lib/storage/nas';
import { getBackupStats } from '@/lib/storage/backup';

export async function GET() {
  const [nasOnline, backupStats] = await Promise.all([
    nasHealthCheck(),
    Promise.resolve(getBackupStats()),
  ]);

  return NextResponse.json({
    nas: { online: nasOnline },
    backup: backupStats,
  });
}
