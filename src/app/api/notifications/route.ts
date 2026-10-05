import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * Drop any notification rows that no longer reflect reality:
 *   - friend_request rows where the underlying friendship is gone or already
 *     accepted/declined.
 *   - follow rows where the requester no longer follows the recipient.
 *   - friend_accept rows where the two users are no longer mutual friends.
 *   - like rows where the like has been removed.
 *   - comment rows where the comment has been deleted.
 *   - share/mention rows where the source post has been deleted.
 *
 * This is a best-effort sweep that runs every time the user loads their
 * notification list, so old rows left over from before the cleanup hooks
 * were added stop haunting the bell badge and the dropdown.
 */
function pruneStaleNotifications(myId: string, db: ReturnType<typeof getDb>): void {
  try {
    // friend_request: only keep when the pending friendship still exists
    db.prepare(
      `DELETE FROM notifications
       WHERE type = 'friend_request'
         AND recipient_id = ?
         AND actor_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.requester_id = notifications.actor_id
             AND f.receiver_id = notifications.recipient_id
             AND f.status = 'pending'
         )`
    ).run(myId);

    // friend_accept: only delete when the friendship is gone in BOTH
    // directions. The system only stores one row per friendship in the
    // common case, so we check whichever direction exists. A friend_accept
    // notification is a historical record ("B đã chấp nhận lời mời của
    // bạn") and should stay in the bell until the friendship is dissolved
    // — not disappear on every page load just because the matching
    // direction row happens to be missing.
    db.prepare(
      `DELETE FROM notifications
       WHERE type = 'friend_accept'
         AND actor_id IS NOT NULL
         AND (
           recipient_id = ? OR actor_id = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.status = 'accepted'
             AND (
               (f.requester_id = notifications.actor_id AND f.receiver_id = notifications.recipient_id)
               OR (f.requester_id = notifications.recipient_id AND f.receiver_id = notifications.actor_id)
             )
         )`
    ).run(myId, myId);

    // follow: only keep when the requester still has an accepted follow row
    db.prepare(
      `DELETE FROM notifications
       WHERE type = 'follow'
         AND recipient_id = ?
         AND actor_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.requester_id = notifications.actor_id
             AND f.receiver_id = notifications.recipient_id
             AND f.status = 'accepted'
         )`
    ).run(myId);

    // like: only keep when the like row still exists
    db.prepare(
      `DELETE FROM notifications
       WHERE type = 'like'
         AND recipient_id = ?
         AND actor_id IS NOT NULL
         AND data LIKE '%"postId":%'
         AND NOT EXISTS (
           SELECT 1 FROM likes l
           WHERE l.user_id = notifications.actor_id
             AND 'postId":"' || l.post_id || '"' IN (notifications.data)
         )`
    ).run(myId);

    // comment: only keep when the comment row still exists
    db.prepare(
      `DELETE FROM notifications
       WHERE type = 'comment'
         AND recipient_id = ?
         AND actor_id IS NOT NULL
         AND data LIKE '%"commentId":%'
         AND NOT EXISTS (
           SELECT 1 FROM comments c
           WHERE c.user_id = notifications.actor_id
             AND 'commentId":"' || c.id || '"' IN (notifications.data)
         )`
    ).run(myId);

    // share/mention referencing a post: drop when the post is gone
    db.prepare(
      `DELETE FROM notifications
       WHERE type IN ('share', 'mention')
         AND recipient_id = ?
         AND data LIKE '%"postId":%'
         AND NOT EXISTS (
           SELECT 1 FROM posts p
           WHERE 'postId":"' || p.id || '"' IN (notifications.data)
         )`
    ).run(myId);
  } catch {
    // best-effort — never break the GET response because of cleanup.
  }
}

/**
 * GET /api/notifications
 *
 * Query params:
 *   - limit   : 1..100 (default 30)
 *   - offset  : pagination offset (default 0)
 *   - unread  : "1" to return only unread notifications
 *
 * Always returns `{ items, unreadCount, total }` so the bell badge can be
 * updated from the same call that loads the list.
 *
 * Read state is integer 0/1. We always coerce the value so the client
 * never has to guess whether `read` is a string, a boolean, or a number.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") ?? "30")));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0"));
  const unreadOnly = url.searchParams.get("unread") === "1";

  try {
    const db = getDb();

    // Sweep away rows that no longer correspond to a real relationship or
    // a real entity. Without this the bell badge and the dropdown can show
    // notifications for friendships/likes/comments that were already
    // undone before the cleanup hooks were added.
    pruneStaleNotifications(myId, db);
    console.log(`[notifications] GET served for user=${myId}`);

    const where = unreadOnly
      ? `WHERE n.recipient_id = ? AND n.read = 0`
      : `WHERE n.recipient_id = ?`;

    const items = db
      .prepare(
        `SELECT
            n.id, n.type, n.title, n.body, n.data, n.read, n.read_at, n.created_at,
            n.actor_id,
            u.username as actor_username,
            u.name as actor_name,
            u.avatar as actor_avatar
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         ${where}
         ORDER BY n.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(myId, limit, offset) as any[];

    const unreadCount = (db
      .prepare(`SELECT COUNT(*) as c FROM notifications WHERE recipient_id = ? AND read = 0`)
      .get(myId) as any).c as number;

    const total = (db
      .prepare(`SELECT COUNT(*) as c FROM notifications WHERE recipient_id = ?`)
      .get(myId) as any).c as number;

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      {
        items: items.map((row) => {
          let parsedData: unknown = null;
          if (row.data) {
            try {
              parsedData = JSON.parse(row.data);
            } catch {
              parsedData = null;
            }
          }
          return {
            id: row.id,
            type: row.type,
            title: row.title,
            body: row.body,
            data: parsedData,
            // Coerce to a clean boolean so the UI never has to deal with
            // a string "0"/"1" coming back from SQLite.
            read: Number(row.read) === 1,
            readAt: row.read_at ?? null,
            createdAt: row.created_at,
            actor: row.actor_id
              ? {
                  id: row.actor_id,
                  username: row.actor_username,
                  name: row.actor_name,
                  avatar: row.actor_avatar,
                }
              : null,
          };
        }),
        unreadCount,
        total,
      },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
