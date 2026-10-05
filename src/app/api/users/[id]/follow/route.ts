import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/users/[id]/follow
 *   - Sends a follow request (status="accepted" immediately if the target
 *     already follows you; otherwise creates a pending request).
 *   - This matches the user's rule: a follow only counts as a friendship
 *     when both sides follow each other. Until the target accepts, the
 *     viewer sees them only in "Đã gửi lời mời", not "Đang theo dõi".
 *
 * PUT /api/users/[id]/follow  body={ action: "accept" | "reject" }
 *   - Accept/reject a pending request sent TO the viewer.
 *
 * DELETE /api/users/[id]/follow
 *   - Unfollow (remove the row in either direction).
 *
 * Friendship model:
 *   - friendships(requester_id=A, receiver_id=B, status='accepted')
 *     means "A follows B and B has accepted".
 *   - For mutual friendship (A and B are friends), both
 *     (A→B, accepted) AND (B→A, accepted) must exist.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "fs_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

async function resolveIds(req: NextRequest, targetId: string) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders }) };
  }
  const myId = (session.user as any).id;
  if (targetId === myId) {
    return { error: NextResponse.json({ error: "Không thể tự theo dõi chính mình" }, { status: 400 }, { headers: corsHeaders }) };
  }
  return { myId };
}


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetId } = await params;
  const r = await resolveIds(_req, targetId);
  if ("error" in r) return r.error;
  const { myId } = r;

  try {
    const db = getDb();
    const target = db.prepare(`SELECT id FROM users WHERE id = ? LIMIT 1`).get(targetId) as any;
    if (!target) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 }, { headers: corsHeaders });
    }

    // 1) Did I already follow them?
    const mine = db
      .prepare(
        `SELECT * FROM friendships WHERE requester_id = ? AND receiver_id = ? LIMIT 1`
      )
      .get(myId, targetId) as any;

    if (mine) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({
        ok: true,
        status: mine.status,
        relationship: "already_following",
      }, { headers: corsHeaders });
    }

    const now = Math.floor(Date.now() / 1000);

    // 2) Does the target already follow me?
    //    If yes, auto-accept so both sides become mutual friends.
    const reverse = db
      .prepare(
        `SELECT * FROM friendships WHERE requester_id = ? AND receiver_id = ? LIMIT 1`
      )
      .get(targetId, myId) as any;

    if (reverse) {
      // Auto-accept the reverse request now
      db.prepare(
        `UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?`
      ).run(now, reverse.id);
      // Insert my follow row as accepted too — mutual follows
      const myId2 = genId();
      db.prepare(
        `INSERT INTO friendships (id, requester_id, receiver_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'accepted', ?, ?)`
      ).run(myId2, myId, targetId, now, now);

      // Drop the bell notification I got when targetId started following me
      // so the badge reflects the new mutual state on next poll.
      try {
        db.prepare(
          `DELETE FROM notifications
           WHERE type = 'follow'
             AND recipient_id = ?
             AND actor_id = ?`
        ).run(myId, targetId);
      } catch {
        // best-effort
      }

      // Drop the bell notification targetId got when I started following
      // them in the past (covers a follow/unfollow/follow round-trip too).
      try {
        db.prepare(
          `DELETE FROM notifications
           WHERE type = 'follow'
             AND recipient_id = ?
             AND actor_id = ?`
        ).run(targetId, myId);
      } catch {
        // best-effort
      }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({
        ok: true,
        status: "accepted",
        relationship: "mutual_friend",
      }, { headers: corsHeaders });
    }

    // 3) Otherwise, send a pending request that the target must accept.
    const id = genId();
    db.prepare(
      `INSERT INTO friendships (id, requester_id, receiver_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'accepted', ?, ?)`
    ).run(id, myId, targetId, now, now);

    // Notify the target about a new follower.
    try {
      const me = db
        .prepare(`SELECT username, name FROM users WHERE id = ?`)
        .get(myId) as any;
      const actorName = me?.name || me?.username || "Ai đó";
      createNotification({
        recipientId: targetId,
        actorId: myId,
        type: "follow",
        title: `${actorName} đã bắt đầu theo dõi bạn`,
        body: "Nhấn để xem hồ sơ.",
        data: { userId: myId },
      });
    } catch {
      // best-effort
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json({
      ok: true,
      status: "accepted",
      relationship: "one_way_follow",
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetId } = await params;
  const r = await resolveIds(req, targetId);
  if ("error" in r) return r.error;
  const { myId } = r;

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action === "reject" ? "rejected" : "accepted";

    const db = getDb();
    // The pending request must be from targetId → myId
    const existing = db
      .prepare(
        `SELECT * FROM friendships
         WHERE requester_id = ? AND receiver_id = ?
         LIMIT 1`
      )
      .get(targetId, myId) as any;
    if (!existing) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không có lời mời theo dõi nào" }, { status: 404 }, { headers: corsHeaders });
    }

    const now = Math.floor(Date.now() / 1000);

    if (action === "rejected") {
      db.prepare(`DELETE FROM friendships WHERE id = ?`).run(existing.id);
      // Drop the bell notification the requester got when they sent the
      // follow request so the badge reflects the new reality on next poll.
      try {
        db.prepare(
          `DELETE FROM notifications
           WHERE type = 'follow'
             AND recipient_id = ?
             AND actor_id = ?`
        ).run(myId, targetId);
      } catch {
        // best-effort
      }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ ok: true, status: "rejected" }, { headers: corsHeaders });
    }

    // Accept: mark reverse as accepted AND insert our follow row → mutual
    db.prepare(
      `UPDATE friendships SET status = 'accepted', updated_at = ? WHERE id = ?`
    ).run(now, existing.id);
    const myFollowId = genId();
    db.prepare(
      `INSERT INTO friendships (id, requester_id, receiver_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'accepted', ?, ?)`
    ).run(myFollowId, myId, targetId, now, now);

    // Drop the bell notification the requester got when they sent the
    // follow request so the badge reflects the new reality on next poll.
    try {
      db.prepare(
        `DELETE FROM notifications
         WHERE type = 'follow'
           AND recipient_id = ?
           AND actor_id = ?`
      ).run(myId, targetId);
    } catch {
      // best-effort
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({
      ok: true,
      status: "accepted",
      relationship: "mutual_friend",
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetId } = await params;
  const r = await resolveIds(_req, targetId);
  if ("error" in r) return r.error;
  const { myId } = r;

  try {
    const db = getDb();
    // Remove only the row where I am requester (my outgoing follow)
    // If the reverse row exists, that one stays — they still follow me,
    // but I'm no longer following them.
    const result = db
      .prepare(
        `DELETE FROM friendships WHERE requester_id = ? AND receiver_id = ?`
      )
      .run(myId, targetId);

    // Drop the bell notification the target got when I started following
    // them so the badge and dropdown reflect the new reality on next poll.
    // Match by recipient + actor + type so we never wipe someone else's
    // notification.
    try {
      db.prepare(
        `DELETE FROM notifications
         WHERE type = 'follow'
           AND recipient_id = ?
           AND actor_id = ?`
      ).run(targetId, myId);
    } catch {
      // best-effort
    }

    // Also drop any stale "friend_request" notification that was sent by the
    // target to me (in case the request is still pending and was never
    // accepted/declined — e.g. a one-way follow that is now being removed).
    try {
      db.prepare(
        `DELETE FROM notifications
         WHERE type = 'friend_request'
           AND recipient_id = ?
           AND actor_id = ?`
      ).run(myId, targetId);
    } catch {
      // best-effort
    }

    // Also drop any stale "friend_accept" notifications either side received
    // when we became mutual friends. After unfollowing, those rows no longer
    // reflect the real relationship.
    try {
      db.prepare(
        `DELETE FROM notifications
         WHERE type = 'friend_accept'
           AND ((recipient_id = ? AND actor_id = ?)
                OR (recipient_id = ? AND actor_id = ?))`
      ).run(myId, targetId, targetId, myId);
    } catch {
      // best-effort
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true, removed: result.changes }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}