import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/groups/activity
 *
 * Returns a unified recent-activity feed combining:
 *   - New friendships (member joins) for the viewer's group
 *   - Likes the viewer's friends have made on posts
 *   - Comments on posts by the viewer or accepted friends
 *
 * Each item is normalized to:
 *   { id, type: "join"|"like"|"comment", actor: { id, name, username, avatar },
 *     postId?: string, content?: string, createdAt }
 *
 * Sorted by createdAt DESC, limit 12.
 */
export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(_req: NextRequest) {
  const session = await getSessionFromRequest(_req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  try {
    const db = getDb();

    // 1. Recent friendships where viewer is one side (accepted)
    const friendRows = db
      .prepare(
        `SELECT f.id, f.updated_at, f.created_at, f.requester_id, f.receiver_id,
                u.username, u.name, u.avatar
         FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.requester_id = ? THEN f.receiver_id
           ELSE f.requester_id
         END
         WHERE (f.requester_id = ? OR f.receiver_id = ?)
           AND f.status = 'accepted'
         ORDER BY f.created_at DESC
         LIMIT 8`
      )
      .all(myId, myId, myId) as any[];

    // 2. Recent likes by friends on any post
    const likeRows = db
      .prepare(
        `SELECT l.id, l.created_at, l.post_id, u.id as actor_id, u.username, u.name, u.avatar
         FROM likes l
         JOIN users u ON u.id = l.user_id
         WHERE l.user_id != ?
           AND EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND ((f.requester_id = ? AND f.receiver_id = l.user_id)
                    OR (f.requester_id = l.user_id AND f.receiver_id = ?))
           )
         ORDER BY l.created_at DESC
         LIMIT 8`
      )
      .all(myId, myId, myId) as any[];

    // 3. Recent comments by friends on group posts
    const commentRows = db
      .prepare(
        `SELECT c.id, c.created_at, c.post_id, c.content,
                u.id as actor_id, u.username, u.name, u.avatar
         FROM comments c
         JOIN users u ON u.id = c.user_id
         WHERE c.user_id != ?
           AND EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND ((f.requester_id = ? AND f.receiver_id = c.user_id)
                    OR (f.requester_id = c.user_id AND f.receiver_id = ?))
           )
         ORDER BY c.created_at DESC
         LIMIT 8`
      )
      .all(myId, myId, myId) as any[];

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const items: Array<{
      id: string;
      type: "join" | "like" | "comment";
      actor: { id: string; username: string; name: string | null; avatar: string | null };
      postId?: string;
      content?: string;
      createdAt: number;
    }> = [];

    for (const f of friendRows) {
      const requesterIsMe = f.requester_id === myId;
      items.push({
        id: `join_${f.id}`,
        type: "join",
        actor: {
          id: requesterIsMe ? f.receiver_id : f.requester_id,
          username: f.username,
          name: f.name,
          avatar: f.avatar,
        },
        createdAt: f.created_at,
      });
    }

    for (const l of likeRows) {
      items.push({
        id: `like_${l.id}`,
        type: "like",
        actor: {
          id: l.actor_id,
          username: l.username,
          name: l.name,
          avatar: l.avatar,
        },
        postId: l.post_id,
        createdAt: l.created_at,
      });
    }

    for (const c of commentRows) {
      items.push({
        id: `comment_${c.id}`,
        type: "comment",
        actor: {
          id: c.actor_id,
          username: c.username,
          name: c.name,
          avatar: c.avatar,
        },
        postId: c.post_id,
        content: c.content,
        createdAt: c.created_at,
      });
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json(items.slice(0, 12));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}