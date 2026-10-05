import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

function cuid() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

/**
 * Delete every notification related to a given friendship id.
 * Used when a friend request is accepted / declined / cancelled so the
 * bell badge and the dropdown stop showing the stale "friend_request"
 * row even after the request is gone.
 *
 * We pass both the friendship id and the requester id so we can clean up
 * notifications that were written before `requestId` was stored in `data`.
 */
function deleteFriendRequestNotifications(
  friendshipId: string,
  requesterId: string,
  recipientId: string,
  db: ReturnType<typeof getDb>
) {
  // 1) Match by `requestId` stored in `data` (notifications written after
  //    this fix).
  db.prepare(
    `DELETE FROM notifications
     WHERE type = 'friend_request'
       AND recipient_id = ?
       AND data LIKE ?`
  ).run(recipientId, `%"requestId":"${friendshipId}"%`);

  // 2) Fallback: clean up legacy rows written before this fix. Those rows
  //    only carry `requesterId` in `data`, not `requestId`. We match by
  //    recipient + actor (the same friend request) and remove any leftover
  //    friend_request notification that didn't have a `requestId` field.
  db.prepare(
    `DELETE FROM notifications
     WHERE type = 'friend_request'
       AND recipient_id = ?
       AND actor_id = ?
       AND (data IS NULL OR data NOT LIKE '%"requestId"%')`
  ).run(recipientId, requesterId);
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

// GET /api/friend-request

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "received";

  try {
    const db = getDb();

    if (mode === "count") {
      const row = db.prepare(`
        SELECT COUNT(*) as count FROM friendships
        WHERE receiver_id = ? AND status = 'pending'
      `).get(myId) as any;
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ count: row.count }, { headers: corsHeaders });
    }

    if (mode === "received") {
      // Only return *pending* friend requests, otherwise the dropdown
      // would surface rows that are already accepted/declined and
      // whose accept/decline buttons return 404 — making the buttons
      // look broken.
      const rows = db.prepare(`
        SELECT f.id, f.status, f.created_at,
          u.id as user_id, u.name, u.username, u.avatar, u.bio
        FROM friendships f
        LEFT JOIN users u ON u.id = f.requester_id
        WHERE f.receiver_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `).all(myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(rows);
    }

    if (mode === "sent") {
      // Only pending requests should appear under "Đã gửi"; accepted
      // ones belong in the friend list, declined ones should disappear.
      const rows = db.prepare(`
        SELECT f.id, f.status, f.created_at,
          u.id as user_id, u.name, u.username, u.avatar, u.bio
        FROM friendships f
        LEFT JOIN users u ON u.id = f.receiver_id
        WHERE f.requester_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `).all(myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(rows);
    }

    if (mode === "friends") {
      const rows = db.prepare(`
        SELECT
          u.id as user_id, u.name, u.username, u.avatar, u.bio,
          f.status, MAX(f.created_at) as friends_since
        FROM friendships f
        LEFT JOIN users u ON
          (u.id = f.requester_id AND f.receiver_id = ?)
          OR (u.id = f.receiver_id AND f.requester_id = ?)
        WHERE f.status = 'accepted'
          AND (f.requester_id = ? OR f.receiver_id = ?)
        GROUP BY u.id
        ORDER BY friends_since DESC
      `).all(myId, myId, myId, myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(rows);
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ error: "mode không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

// POST /api/friend-request
// Body: { userId, action }
//   action=send       → gửi lời mời
//   action=accept     → chấp nhận (cần requestId)
//   action=decline    → từ chối (cần requestId)
//   action=cancel     → hủy lời mời đã gửi (cần requestId)
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  try {
    const body = await request.json();
    const { userId, requestId, action } = body;

    if (!action) {
      return NextResponse.json({ error: "Thiếu action" }, { status: 400 }, { headers: corsHeaders });
    }

    const db = getDb();

    if (action === "send") {
      if (!userId) return NextResponse.json({ error: "Thiếu userId" }, { status: 400 }, { headers: corsHeaders });
      if (userId === myId) return NextResponse.json({ error: "Không thể kết bạn với chính mình" }, { status: 400 }, { headers: corsHeaders });

      // Check existing
      const existing = db.prepare(`
        SELECT id, status FROM friendships
        WHERE (requester_id = ? AND receiver_id = ?)
           OR (requester_id = ? AND receiver_id = ?)
      `).get(myId, userId, userId, myId) as any;

      if (existing) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        if (existing.status === "pending") {
          return NextResponse.json({ error: "Đã gửi lời mời trước đó" }, { status: 409 }, { headers: corsHeaders });
        }
        if (existing.status === "accepted") {
          return NextResponse.json({ error: "Đã là bạn bè" }, { status: 409 }, { headers: corsHeaders });
        }
        // rejected → allow re-send
        db.prepare("DELETE FROM friendships WHERE id = ?").run(existing.id);
      }

      const id = cuid();
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO friendships (id, requester_id, receiver_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `).run(id, myId, userId, now, now);

      // Notify the receiver that someone sent them a friend request.
      try {
        const me = db
          .prepare(`SELECT username, name FROM users WHERE id = ?`)
          .get(myId) as any;
        const actorName = me?.name || me?.username || "Ai đó";
        createNotification({
          recipientId: userId,
          actorId: myId,
          type: "friend_request",
          title: `${actorName} đã gửi lời mời kết bạn`,
          body: "Nhấn để xem và phản hồi lời mời.",
          data: { requestId: id, requesterId: myId },
        });
      } catch {
        // Notifications are best-effort — never fail the request.
      }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ id, status: "pending" }, { status: 201 }, { headers: corsHeaders });
    }

    if (action === "accept") {
      if (!requestId) return NextResponse.json({ error: "Thiếu requestId" }, { status: 400 }, { headers: corsHeaders });
      const now = Math.floor(Date.now() / 1000);

      // Fetch the friendship first to know the other user
      const fr = db.prepare(`
        SELECT id, requester_id, receiver_id FROM friendships
        WHERE id = ? AND receiver_id = ? AND status = 'pending'
      `).get(requestId, myId) as any;
      if (!fr) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ error: "Không tìm thấy lời mời" }, { status: 404 }, { headers: corsHeaders });
      }

      const otherUserId = fr.requester_id;

      // Use a transaction to ensure atomicity
      const tx = db.transaction(() => {
        // Mark the incoming request as accepted
        db.prepare(`
          UPDATE friendships SET status = 'accepted', updated_at = ?
          WHERE id = ? AND receiver_id = ? AND status = 'pending'
        `).run(now, requestId, myId);

        // Remove any duplicate reverse-direction rows (older data, rejected attempts)
        // so we never end up with two 'accepted' rows for the same pair.
        db.prepare(`
          DELETE FROM friendships
          WHERE status = 'accepted'
            AND requester_id = ? AND receiver_id = ?
            AND id != ?
        `).run(myId, otherUserId, requestId);

        db.prepare(`
          DELETE FROM friendships
          WHERE status = 'accepted'
            AND requester_id = ? AND receiver_id = ?
            AND id != ?
        `).run(otherUserId, myId, requestId);
      });
      tx();

      // Tell the original requester that you accepted them.
      try {
        const me = db
          .prepare(`SELECT username, name FROM users WHERE id = ?`)
          .get(myId) as any;
        const actorName = me?.name || me?.username || "Ai đó";
        createNotification({
          recipientId: otherUserId,
          actorId: myId,
          type: "friend_accept",
          title: `${actorName} đã chấp nhận lời mời kết bạn`,
          body: "Bạn đã trở thành bạn bè — bắt đầu trò chuyện thôi!",
          data: { userId: myId },
        });
      } catch {
        // best-effort
      }

      // Clear the stale friend_request notification rows for the current
      // user. Without this the bell badge keeps showing the old lời mời
      // even though the friendship row is gone.
      try {
        deleteFriendRequestNotifications(requestId, otherUserId, myId, db);
      } catch {
        // best-effort
      }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ status: "accepted" }, { headers: corsHeaders });
    }

    if (action === "decline") {
      if (!requestId) return NextResponse.json({ error: "Thiếu requestId" }, { status: 400 }, { headers: corsHeaders });
      // Fetch the requester_id first so we can clean up notifications.
      const fr = db
        .prepare(
          `SELECT requester_id FROM friendships
           WHERE id = ? AND receiver_id = ? AND status = 'pending' LIMIT 1`
        )
        .get(requestId, myId) as any;
      const result = db.prepare(`
        DELETE FROM friendships WHERE id = ? AND receiver_id = ? AND status = 'pending'
      `).run(requestId, myId);
      if (result.changes > 0 && fr) {
        try {
          deleteFriendRequestNotifications(requestId, fr.requester_id, myId, db);
        } catch {
          // best-effort
        }
      }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      if (result.changes === 0) {
        return NextResponse.json({ error: "Không tìm thấy lời mời" }, { status: 404 }, { headers: corsHeaders });
      }
      return NextResponse.json({ status: "declined" }, { headers: corsHeaders });
    }

    if (action === "cancel") {
      if (!requestId) return NextResponse.json({ error: "Thiếu requestId" }, { status: 400 }, { headers: corsHeaders });
      // Fetch the receiver_id so we can clean up the notification we
      // originally sent (the recipient is the other side here).
      const fr = db
        .prepare(
          `SELECT receiver_id FROM friendships
           WHERE id = ? AND requester_id = ? AND status = 'pending' LIMIT 1`
        )
        .get(requestId, myId) as any;
      const result = db.prepare(`
        DELETE FROM friendships WHERE id = ? AND requester_id = ? AND status = 'pending'
      `).run(requestId, myId);
      if (result.changes > 0 && fr) {
        try {
          deleteFriendRequestNotifications(requestId, myId, fr.receiver_id, db);
        } catch {
          // best-effort
        }
      }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      if (result.changes === 0) {
        return NextResponse.json({ error: "Không tìm thấy lời mời" }, { status: 404 }, { headers: corsHeaders });
      }
      return NextResponse.json({ status: "cancelled" }, { headers: corsHeaders });
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
