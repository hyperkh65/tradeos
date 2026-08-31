import { getDb, newId, now } from '@/lib/db/sqlite';
import type { User } from '@/types';
import { createNotification } from '@/lib/notifications';
import { getPhotoById, canViewPhotoWithShares } from '@/lib/photos/db';
import { isPhotoAdmin } from '@/lib/photos/permissions';

export interface PhotoCommentRow {
  id: string; photoId: string; userId: string; userName: string;
  content: string; createdAt: string; updatedAt: string | null;
}

export type CommentResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

function rowToComment(r: Record<string, unknown>): PhotoCommentRow {
  return {
    id: r.id as string, photoId: r.photo_id as string, userId: r.user_id as string, userName: r.user_name as string,
    content: r.content as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string | null,
  };
}

export function listPhotoComments(user: User, photoId: string): CommentResult<PhotoCommentRow[]> {
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canViewPhotoWithShares(user, photo)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const rows = db.prepare(`SELECT * FROM photo_comments WHERE photo_id=? AND deleted_at IS NULL ORDER BY created_at ASC`).all(photoId) as Record<string, unknown>[];
  return { ok: true, data: rows.map(rowToComment) };
}

/** 요청서 19~20번: @이름 멘션 → 알림. tasks 댓글의 동일 패턴(app/api/tasks/[id]/comments/route.ts)을 그대로 복제. */
async function notifyMentions(content: string, photoId: string, photoTitle: string | null, actor: User) {
  const mentionPattern = /@(\S+)/g;
  const mentions = content.match(mentionPattern) ?? [];
  if (mentions.length === 0) return;
  const db = getDb();
  const mentionedNames = [...new Set(mentions.map(m => m.slice(1)))];
  for (const name of mentionedNames) {
    const mentionedUser = db.prepare(`SELECT id FROM users WHERE name = ? AND id != ?`).get(name, actor.id) as { id: string } | undefined;
    if (mentionedUser) {
      await createNotification({
        userIds: [mentionedUser.id],
        type: 'photo_mention',
        title: `${actor.name}님이 사진에서 회원님을 언급했습니다`,
        body: photoTitle ? `사진: ${photoTitle}` : undefined,
        link: `/photos?photoId=${photoId}`,
        createdBy: actor.id,
        createdByName: actor.name,
      });
    }
  }
}

export async function addPhotoComment(user: User, photoId: string, content: string): Promise<CommentResult<PhotoCommentRow>> {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: '내용을 입력하세요', status: 400 };
  const photo = getPhotoById(photoId);
  if (!photo || photo.deletedAt) return { ok: false, error: 'not found', status: 404 };
  if (!canViewPhotoWithShares(user, photo)) return { ok: false, error: '권한이 없습니다', status: 403 };

  const db = getDb();
  const id = newId();
  const ts = now();
  db.prepare(`INSERT INTO photo_comments (id, photo_id, user_id, user_name, content, created_at) VALUES (?,?,?,?,?,?)`)
    .run(id, photoId, user.id, user.name, trimmed, ts);

  await notifyMentions(trimmed, photoId, photo.title, user);

  const row = db.prepare(`SELECT * FROM photo_comments WHERE id=?`).get(id) as Record<string, unknown>;
  return { ok: true, data: rowToComment(row) };
}

export function deletePhotoComment(user: User, photoId: string, commentId: string): CommentResult<null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM photo_comments WHERE id=? AND photo_id=?`).get(commentId, photoId) as Record<string, unknown> | undefined;
  if (!row || row.deleted_at) return { ok: false, error: 'not found', status: 404 };
  const comment = rowToComment(row);
  if (comment.userId !== user.id && !isPhotoAdmin(user)) {
    return { ok: false, error: '권한이 없습니다', status: 403 };
  }
  db.prepare(`UPDATE photo_comments SET deleted_at=? WHERE id=?`).run(now(), commentId);
  return { ok: true, data: null };
}
