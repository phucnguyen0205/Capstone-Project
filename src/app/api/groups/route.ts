import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups
 *
 * Returns two lists:
 *   - mine     : groups the caller is a member of, with their role.
 *   - discover : public groups the caller is NOT a member of, with
 *                member count and creator name. Private groups are
 *                never listed here — even for members they don't show
 *                up unless the caller belongs.
 *
 * This is the single entry point for the GroupsDashboard left rail:
 * the user's own groups go on top, the public-discovery list goes
 * below as a separate section.
 */
export const dynamic = "force-dynamic";

interface MyGroupRow {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  visibility: "public" | "private";
  creator_id: string;
  created_at: number;
  member_count: number;
  role: "creator" | "admin" | "member";
  creator_username: string;
  creator_name: string | null;
}

interface DiscoverRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  creator_username: string;
  creator_name: string | null;
}

export async function GET(_request: NextRequest) {
  const session = await getSessionFromRequest(_request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  try {
    const db = getDb();

    // ── Mine ──────────────────────────────────────────────────────────
    // Joins group_members → groups + creator user so the sidebar can
    // show "Người tạo: <name>" and the role badge (creator/admin/
    // member) without a second round-trip.
    const mine = db
      .prepare(
        `SELECT g.id, g.name, g.avatar_url, g.description, g.visibility,
                g.creator_id, g.created_at,
                u.username AS creator_username, u.name AS creator_name,
                gm.role,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
         JOIN users u ON u.id = g.creator_id
         WHERE gm.user_id = ?
         ORDER BY (gm.role = 'creator') DESC, (gm.role = 'admin') DESC, g.updated_at DESC`
      )
      .all(myId) as MyGroupRow[];

    // ── Discover (public groups I'm NOT in) ───────────────────────────
    // We exclude the caller's own groups so the Discover list only
    // surfaces groups they could actually join. Private groups are
    // hidden entirely by the WHERE visibility = 'public' clause.
    const discover = db
      .prepare(
        `SELECT g.id, g.name, g.description, g.avatar_url,
                u.username AS creator_username, u.name AS creator_name,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
         FROM groups g
         JOIN users u ON u.id = g.creator_id
         WHERE g.visibility = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM group_members gm2
             WHERE gm2.group_id = g.id AND gm2.user_id = ?
           )
         ORDER BY member_count DESC, g.created_at DESC
         LIMIT 50`
      )
      .all(myId) as DiscoverRow[];

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      {
        mine: mine.map((g) => ({
          id: g.id,
          name: g.name,
          avatarUrl: g.avatar_url,
          description: g.description,
          visibility: g.visibility,
          creatorId: g.creator_id,
          creatorUsername: g.creator_username,
          creatorName: g.creator_name,
          memberCount: g.member_count,
          role: g.role,
          createdAt: g.created_at,
        })),
        discover: discover.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          avatarUrl: g.avatar_url,
          memberCount: g.member_count,
          creatorUsername: g.creator_username,
          creatorName: g.creator_name,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

/**
 * POST /api/groups
 *
 * Create a new group. Body:
 *   { name: string, description?: string, visibility?: "public"|"private",
 *     avatarUrl?: string }
 *
 * The caller becomes the creator and is added to group_members with
 * role='creator'. The visibility default is "private" — public
 * discoverability is opt-in.
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    visibility?: "public" | "private";
    avatarUrl?: string;
  };

  const name = (body.name ?? "").trim().slice(0, 60);
  if (!name) {
    return NextResponse.json({ error: "Tên nhóm không được để trống" }, { status: 400, headers: corsHeaders });
  }

  const description = (body.description ?? "").trim().slice(0, 500) || null;
  const visibility = body.visibility === "public" ? "public" : "private";
  const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.slice(0, 500) : null;

  const groupId = "g_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  const memberId = "gm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  const now = Math.floor(Date.now() / 1000);

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO groups (id, name, avatar_url, description, visibility, creator_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(groupId, name, avatarUrl, description, visibility, myId, now, now);

    db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role, joined_at)
       VALUES (?, ?, ?, 'creator', ?)`
    ).run(memberId, groupId, myId, now);

    // ── Mirror the group into the chat layer ────────────────────────
    // Every group in /groups should have a matching group chat in the
    // chat box so the two surfaces stay in sync. The conversation
    // starts with just the creator; members get added when they join
    // via /api/groups/[id]/join.
    try {
      const nowMs = Date.now();
      const convId =
        "c_" + nowMs.toString(36) + Math.random().toString(36).slice(2, 11);
      db.prepare(
        `INSERT INTO conversations (id, created_at, updated_at, name, is_group, avatar_url, group_id)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      ).run(convId, nowMs, nowMs, name, avatarUrl, groupId);

      db.prepare(
        `INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at, role)
         VALUES (?, ?, ?, ?, 'creator')`
      ).run(
        "cp_" + nowMs.toString(36) + Math.random().toString(36).slice(2, 11),
        convId,
        myId,
        nowMs
      );
    } catch (chatErr) {
      // Best-effort: if the chat mirror fails, the group itself is
      // still usable. Log so we can spot the bug in dev.
      console.error("[groups POST] failed to mirror into chat:", chatErr);
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json(
      { ok: true, id: groupId, role: "creator" },
      { status: 201, headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}