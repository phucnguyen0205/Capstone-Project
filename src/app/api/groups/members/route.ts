import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/groups/members
 *
 * Returns accepted-friend users (the "group members" in this app). Each entry
 * includes the relationship to the viewer (addedBy: who initiated the
 * friendship), avatar, presence, and friendship metadata.
 *
 * Query params:
 *   - limit   : max 100 (default 24)
 *   - kind    : "all" | "recent" (default "all") — "recent" sorts by friendship
 *               updated_at DESC and limits to last 8
 */
export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "24"), 100);
  const kind = searchParams.get("kind") ?? "all";

  try {
    const db = getDb();

    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar, u.bio,
                u.hobbies, u.occupation,
                u.is_online, u.last_active_at,
                f.id as friendship_id, f.created_at as friendship_created_at,
                f.requester_id
         FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.requester_id = ? THEN f.receiver_id
           ELSE f.requester_id
         END
         WHERE (f.requester_id = ? OR f.receiver_id = ?)
           AND f.status = 'accepted'
         ORDER BY f.updated_at DESC
         LIMIT ?`
      )
      .all(myId, myId, myId, limit) as any[];

    // For each member, look up the friendship initiator to render
    // "added by <name>" copy. The requester is who initiated.
    const requesterIds = Array.from(new Set(rows.map((r) => r.requester_id)));
    const requesterMap: Record<string, { username: string; name: string | null }> = {};
    if (requesterIds.length > 0) {
      const placeholders = requesterIds.map(() => "?").join(",");
      const rRows = db
        .prepare(
          `SELECT id, username, name FROM users WHERE id IN (${placeholders})`
        )
        .all(...requesterIds) as any[];
      for (const r of rRows) {
        requesterMap[r.id] = { username: r.username, name: r.name };
      }
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const now = Math.floor(Date.now() / 1000);
    const data = rows.map((r) => {
      const lastActive = r.last_active_at ?? 0;
      const isOnline = r.is_online ?? 0;
      const delta = Math.max(0, now - lastActive);
      const effectivelyOnline = !!isOnline && delta < 5 * 60;
      const requester = requesterMap[r.requester_id] ?? null;
      const addedBySelf = r.requester_id === myId;
      return {
        id: r.id,
        username: r.username,
        name: r.name,
        avatar: r.avatar,
        bio: r.bio,
        hobbies: r.hobbies,
        occupation: r.occupation,
        isOnline: effectivelyOnline,
        friendshipCreatedAt: r.friendship_created_at,
        addedBy: addedBySelf
          ? null
          : requester
            ? requester.name ?? requester.username
            : null,
      };
    });

    if (kind === "recent") {
      return NextResponse.json(data.slice(0, 8));
    }
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}