import path from 'path';

/** 승인검사 사진 업로드 루트 — 내부/외부 두 API 트리(app/api/approval-inspection,
 * app/api/inspection-form)와 스냅샷 복사 로직(snapshot.ts)이 모두 이 경로를 공유한다. */
export const UPLOAD_BASE = process.env.NODE_ENV === 'production'
  ? '/volume1/web/tradeos/data/uploads/approval-inspection'
  : path.join(process.cwd(), 'data/uploads/approval-inspection');
