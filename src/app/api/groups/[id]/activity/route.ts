import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { getMemberRole } from "@/lib/groupPermissionsV2";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups/[id]/activity
 *
 * Recent activity scoped to a single group. Combines:
 *   - join  : a new member joined the group
 *   - like  : a member liked a post in the group
 *   - comment: a member commented on a post in the group
 *
 * Only group members can read this — non-members get 404.
 *
 * Response shape matches the legacy /api/groups/activity so the right
 * sidebar can render either.
 */
export const dynamic = "force-dynamic";

interface ActivityRow {
  id: string;
  type: "join" | "like" | "comment";
  actor_id: string;
  actor_username: string;
  actor_name: string | null;
  actor_avatar: string | null;
  post_id?: string;
  content?: string;
  created_at: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(_request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: groupId } = await params;

  const role = await getMemberRole(myId, groupId);
  if (role === null) {
    return NextResponse.json(
      { error: "Nhóm không tồn tại hoặc bạn không có quyền truy cập" },
      { status: 404, headers: corsHeaders }
    );
  }

  try {
    const db = getDb();
    const items: ActivityRow[] = [];

    // ── join events: members that joined the group ────────────────
    // The `group_members.joined_at` column doubles as the event
    // timestamp. We skip the group creator so the very first row
    // doesn't dominate the list (it was created at the same time).
    const joinRows = db
      .prepare(
        `SELECT gm.id, gm.joined_at,
                u.id AS actor_id, u.username AS actor_username,
                u.name AS actor_name, u.avatar AS actor_avatar
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ? AND gm.role != 'creator'
         ORDER BY gm.joined_at DESC
         LIMIT 8`
      )
      .all(groupId) as ActivityRow[];

    for (const j of joinRows) {
      items.push({
        id: `join_${j.id}`,
        type: "join",
        actor_id: j.actor_id,
        actor_username: j.actor_username,
        actor_name: j.actor_name,
        actor_avatar: j.actor_avatar,
        created_at: j.created_at,
      });
    }

    // ── like events on posts in this group ────────────────────────
    // We filter likes by joining through group_posts so we only show
    // activity on posts that actually live in the group. Likes from
    // the viewer themselves are kept — they're still informative for
    // group members who haven't been online.
    const likeRows = db
      .prepare(
        `SELECT l.id, l.created_at, l.post_id,
                u.id AS actor_id, u.username AS actor_username,
                u.name AS actor_name, u.avatar AS actor_avatar
         FROM likes l
         JOIN users u ON u.id = l.user_id
         JOIN group_posts gp ON gp.post_id = l.post_id
         WHERE gp.group_id = ?
         ORDER BY l.created_at DESC
         LIMIT 8`
      )
      .all(groupId) as ActivityRow[];

    for (const l of likeRows) {
      items.push({
        id: `like_${l.id}`,
        type: "like",
        actor_id: l.actor_id,
        actor_username: l.actor_username,
        actor_name: l.actor_name,
        actor_avatar: l.actor_avatar,
        post_id: l.post_id,
        created_at: l.created_at,
      });
    }

    // ── comment events on posts in this group ─────────────────────
    const commentRows = db
      .prepare(
        `SELECT c.id, c.created_at, c.post_id, c.content,
                u.id AS actor_id, u.username AS actor_username,
                u.name AS actor_name, u.avatar AS actor_avatar
         FROM comments c
         JOIN users u ON u.id = c.user_id
         JOIN group_posts gp ON gp.post_id = c.post_id
         WHERE gp.group_id = ?
         ORDER BY c.created_at DESC
         LIMIT 8`
      )
      .all(groupId) as ActivityRow[];

    for (const c of commentRows) {
      items.push({
        id: `comment_${c.id}`,
        type: "comment",
        actor_id: c.actor_id,
        actor_username: c.actor_username,
        actor_name: c.actor_name,
        actor_avatar: c.actor_avatar,
        post_id: c.post_id,
        content: c.content,
        created_at: c.created_at,
      });
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    items.sort((a, b) => b.created_at - a.created_at);
    return NextResponse.json(
      items.slice(0, 12).map((it) => ({
        id: it.id,
        type: it.type,
        actor: {
          id: it.actor_id,
          username: it.actor_username,
          name: it.actor_name,
          avatar: it.actor_avatar,
        },
        postId: it.post_id,
        content: it.content,
        createdAt: it.created_at,
      })),
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}