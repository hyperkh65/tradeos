import { getDb, newId, now } from '@/lib/db/sqlite';

export interface CreateCalendarEventOpts {
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string;
  category: 'sale' | 'quote' | 'po' | 'claim' | 'deadline';
  relatedId: string;
  userId: string;
  userName: string;
}

export async function createCalendarEvent(opts: CreateCalendarEventOpts): Promise<void> {
  try {
    const db = getDb();
    const id = newId();
    const ts = now();
    db.prepare(
      `INSERT INTO calendar_events (id, title, type, date, end_date, all_day, description, created_by, created_by_name, category, related_id, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      opts.title,
      opts.category === 'deadline' ? 'deadline' : 'event',
      opts.date,
      opts.endDate ?? null,
      null,
      opts.userId,
      opts.userName,
      opts.category,
      opts.relatedId,
      ts
    );
  } catch (e) {
    console.error('[calendar-events] createCalendarEvent error:', e);
  }
}
