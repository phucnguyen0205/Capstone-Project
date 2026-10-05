import { getDb } from "@/lib/db/server";

/**
 * Notification helpers
 *
 * Centralised write helpers so every "emit a notification" site in the
 * codebase speaks the same SQL. The table is also created lazily by
 * `getDb()` so these helpers never have to call `CREATE TABLE IF NOT EXISTS`.
 */

export type NotificationType =
  | "friend_request"
  | "friend_accept"
  | "like"
  | "comment"
  | "share"
  | "follow"
  | "mention"
  | "group_invite"
  | "system";

export interface CreateNotificationInput {
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
}

function genId() {
  return (
    "nt_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Insert a notification for a recipient. Returns the new id (or null if
 * silently dropped — e.g. self-notification). Errors propagate.
 *
 * The function will NOT create a notification when the recipient equals
 * the actor (no point notifying yourself about your own action).
 */
export function createNotification(input: CreateNotificationInput): string | null {
  if (!input.recipientId) return null;
  if (input.actorId && input.actorId === input.recipientId) return null;

  const db = getDb();
  try {
    const id = genId();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO notifications
         (id, recipient_id, actor_id, type, title, body, data, read, read_at, created_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`
    ).run(
      id,
      input.recipientId,
      input.actorId ?? null,
      input.type,
      input.title,
      input.body ?? null,
      input.data ? JSON.stringify(input.data) : null,
      now
    );
    return id;
  } finally {
    db.close();
  }
}

/**
 * Mark a single notification as read. Idempotent. Returns `true` if a row
 * was updated (including "already read" rows), `false` if the notification
 * doesn't exist or doesn't belong to the user.
 *
 * Always writes `read = 1` (integer) and `read_at = now` (unix seconds).
 */
export function markNotificationRead(
  notificationId: string,
  userId: string
): { ok: boolean; changed: boolean; error?: string } {
  const db = getDb();
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = db
      .prepare(
        `UPDATE notifications
           SET read = 1, read_at = ?
         WHERE id = ? AND recipient_id = ? AND read = 0`
      )
      .run(now, notificationId, userId);
    return { ok: true, changed: result.changes > 0 };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DB error";
    return { ok: false, changed: false, error: message };
  } finally {
    db.close();
  }
}

/**
 * Mark every unread notification for the user as read. Returns the number
 * of rows that were updated.
 */
export function markAllNotificationsRead(userId: string): number {
  const db = getDb();
  try {
    const now = Math.floor(Date.now() / 1000);
    const result = db
      .prepare(
        `UPDATE notifications
           SET read = 1, read_at = ?
         WHERE recipient_id = ? AND read = 0`
      )
      .run(now, userId);
    return result.changes;
  } finally {
    db.close();
  }
}

/**
 * Delete a single notification (only when the user owns it).
 */
export function deleteNotification(notificationId: string, userId: string): boolean {
  const db = getDb();
  try {
    const result = db
      .prepare(
        `DELETE FROM notifications WHERE id = ? AND recipient_id = ?`
      )
      .run(notificationId, userId);
    return result.changes > 0;
  } finally {
    db.close();
  }
}
