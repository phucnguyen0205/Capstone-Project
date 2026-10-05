import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/users/[id]/friends?list=friends|followers|following|requests
 *
 * Returns a list of user objects (id, username, name, avatar, presence)
 * for the requested relationship view.
 *
 *   ?list=friends    : accepted friendships in either direction
 *   ?list=followers  : accepted friendships where receiver_id = target
 *   ?list=following  : accepted friendships where requester_id = target
 *   ?list=requests   : pending requests sent TO the viewer (incoming requests)
 */
export const dynamic = "force-dynamic";

function presentUsers(rows: any[]) {
  const now = Math.floor(Date.now() / 1000);
  return rows.map((u) => {
    const lastActiveAt: number = u.last_active_at ?? 0;
    const isOnlineFlag: number = u.is_online ?? 0;
    const delta = Math.max(0, now - lastActiveAt);
    const effectivelyOnline = !!isOnlineFlag && delta < 5 * 60;
    let presence: any;
    if (!lastActiveAt || lastActiveAt <= 0) {
      presence = { code: 0, label: "Chưa từng hoạt động", dotColor: "gray", isOnline: false };
    } else if (delta < 60 && effectivelyOnline) {
      presence = { code: 3, label: "Đang hoạt động", dotColor: "green", isOnline: true };
    } else if (delta < 5 * 60) {
      presence = { code: 2, label: "Vừa mới truy cập", dotColor: "green", isOnline: effectivelyOnline };
    } else if (delta < 60 * 60) {
      presence = {
        code: 1,
        label: `Hoạt động ${Math.floor(delta / 60)} phút trước`,
        dotColor: "muted",
        isOnline: false,
      };
    } else if (delta < 24 * 60 * 60) {
      const hours = Math.floor(delta / 3600);
      presence = {
        code: 1,
        label: hours < 1 ? "Hoạt động hôm nay" : `Hoạt động ${hours} giờ trước`,
        dotColor: "muted",
        isOnline: false,
      };
    } else {
      presence = { code: 0, label: "Không hoạt động", dotColor: "gray", isOnline: false };
    }
    return {
      id: u.id,
      username: u.username,
      name: u.name,
      avatar: u.avatar,
      bio: u.bio,
      presence,
    };
  });
}


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const { id: targetId } = await params;
  const { searchParams } = new URL(req.url);
  const list = searchParams.get("list") ?? "friends";

  try {
    const db = getDb();

    const target = db
      .prepare(`SELECT id FROM users WHERE id = ? OR username = ? LIMIT 1`)
      .get(targetId, targetId) as any;
    if (!target) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 }, { headers: corsHeaders });
    }
    const tid = target.id;

    let rows: any[] = [];

    if (list === "followers") {
      // Distinct users who have an accepted outgoing row toward the target.
      // (Mutual friendships have two rows describing the same relationship,
      // so we dedupe by requester_id to avoid showing the same follower
      // twice.)
      rows = db
        .prepare(
          `SELECT u.* FROM friendships f
           JOIN users u ON u.id = f.requester_id
           WHERE f.receiver_id = ? AND f.status = 'accepted'
           GROUP BY f.requester_id
           ORDER BY MAX(f.updated_at) DESC`
        )
        .all(tid) as any[];
    } else if (list === "following") {
      // Distinct users the target has an accepted outgoing row toward.
      rows = db
        .prepare(
          `SELECT u.* FROM friendships f
           JOIN users u ON u.id = f.receiver_id
           WHERE f.requester_id = ? AND f.status = 'accepted'
           GROUP BY f.receiver_id
           ORDER BY MAX(f.updated_at) DESC`
        )
        .all(tid) as any[];
    } else if (list === "requests") {
      // pending requests sent TO the viewer (incoming)
      const myId = (session.user as any).id;
      rows = db
        .prepare(
          `SELECT u.* FROM friendships f
           JOIN users u ON u.id = f.requester_id
           WHERE f.receiver_id = ? AND f.status = 'pending'
           ORDER BY f.created_at DESC`
        )
        .all(myId) as any[];
    } else {
      // "friends" — MUTUAL accepted (both sides follow each other)
      rows = db
        .prepare(
          `SELECT DISTINCT u.* FROM users u
           WHERE u.id != ?
             AND EXISTS (
               SELECT 1 FROM friendships f1
               WHERE f1.status = 'accepted'
                 AND f1.requester_id = ? AND f1.receiver_id = u.id
             )
             AND EXISTS (
               SELECT 1 FROM friendships f2
               WHERE f2.status = 'accepted'
                 AND f2.requester_id = u.id AND f2.receiver_id = ?
             )
           ORDER BY u.id`
        )
        .all(tid, tid, tid) as any[];
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json(presentUsers(rows));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
