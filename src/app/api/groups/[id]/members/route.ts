import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { getMemberRole } from "@/lib/groupPermissionsV2";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups/[id]/members
 *
 * Lists every member of the group with their role + presence. Only
 * members of the group can read this — non-members get 404.
 *
 * Uses raw SQL (rather than Drizzle's `select`) because the legacy
 * `users` table has presence columns (`is_online`, `last_active_at`)
 * that aren't represented in the Drizzle schema. We keep the schema
 * minimal and read what's needed here directly.
 */
export const dynamic = "force-dynamic";

interface MemberRow {
  id: string;
  username: string;
  name: string | null;
  avatar: string | null;
  is_online: number;
  last_active_at: number | null;
  role: "creator" | "admin" | "member";
  joined_at: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(_request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: groupId } = await params;

  // Auth gate first so we don't leak member lists.
  const role = await getMemberRole(myId, groupId);
  if (role === null) {
    return NextResponse.json(
      { error: "Nhóm không tồn tại hoặc bạn không có quyền truy cập" },
      { status: 404, headers: corsHeaders }
    );
  }

  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar, u.is_online, u.last_active_at,
                gm.role, gm.joined_at
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?
         ORDER BY (gm.role = 'creator') DESC,
                  (gm.role = 'admin') DESC,
                  gm.joined_at ASC`
      )
      .all(groupId) as MemberRow[];
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const now = Math.floor(Date.now() / 1000);
    return NextResponse.json(
      rows.map((m) => {
        const lastActive = m.last_active_at ?? 0;
        const delta = Math.max(0, now - lastActive);
        const isOnline = !!m.is_online && delta < 5 * 60;
        return {
          id: m.id,
          username: m.username,
          name: m.name,
          avatar: m.avatar,
          isOnline,
          role: m.role,
          joinedAt: m.joined_at,
        };
      }),
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}