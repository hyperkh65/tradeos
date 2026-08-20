import { getDb, newId, now } from '@/lib/db/sqlite';

export interface CreateNotificationOpts {
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  link?: string;
  createdBy?: string;
  createdByName?: string;
}

export async function createNotification(opts: CreateNotificationOpts): Promise<void> {
  try {
    const db = getDb();
    const ts = now();
    const insert = db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_by, created_by_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
    );
    db.transaction(() => {
      for (const userId of opts.userIds) {
        insert.run(
          newId(),
          userId,
          opts.type,
          opts.title,
          opts.body ?? null,
          opts.link ?? null,
          opts.createdBy ?? null,
          opts.createdByName ?? null,
          ts
        );
      }
    })();
  } catch (e) {
    console.error('[notifications] createNotification error:', e);
  }
}
