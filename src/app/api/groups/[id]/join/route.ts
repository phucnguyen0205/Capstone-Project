import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { getMemberRole } from "@/lib/groupPermissionsV2";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * POST /api/groups/[id]/join
 *
 * Self-serve join. Rules:
 *   - Caller must not already be a member (409 if they are).
 *   - The group must be "public" — private groups reject 403 so a
 *     non-member can't bypass the visibility flag. Phase 3 can add an
 *     invite-token flow for private groups if needed.
 *
 * Returns 201 with { ok: true, role: "member" } on success.
 */
export async function POST(
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
  if (role !== null) {
    return NextResponse.json(
      { error: "Bạn đã là thành viên nhóm này" },
      { status: 409, headers: corsHeaders }
    );
  }

  try {
    const db = getDb();
    const group = db
      .prepare(`SELECT visibility FROM groups WHERE id = ?`)
      .get(groupId) as { visibility: "public" | "private" } | undefined;
    if (!group) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Nhóm không tồn tại" }, { status: 404, headers: corsHeaders });
    }
    if (group.visibility !== "public") {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Nhóm này ở chế độ riêng tư" },
        { status: 403, headers: corsHeaders }
      );
    }

    db.prepare(
      `INSERT INTO group_members (id, group_id, user_id, role, joined_at)
       VALUES (?, ?, ?, 'member', ?)`
    ).run(
      "gm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 11),
      groupId,
      myId,
      Math.floor(Date.now() / 1000)
    );

    // Mirror the join into the chat layer so the chat box for this
    // group includes the new member. Look up the linked conversation
    // by group_id; if no conversation exists yet (legacy group,
    // pre-migration), create one on the fly so joining always shows
    // up in chat.
    try {
      const nowMs = Date.now();
      let convId = db
        .prepare(
          `SELECT id FROM conversations WHERE group_id = ? AND is_group = 1 LIMIT 1`
        )
        .get(groupId) as { id: string } | undefined;

      if (!convId) {
        // Lazy-create a chat for legacy groups. Pull the group's
        // display name + avatar so the chat header looks consistent.
        const grp = db
          .prepare(`SELECT name, avatar_url FROM groups WHERE id = ?`)
          .get(groupId) as { name: string; avatar_url: string | null } | undefined;
        if (grp) {
          convId = { id: "c_" + nowMs.toString(36) + Math.random().toString(36).slice(2, 11) };
          db.prepare(
            `INSERT INTO conversations (id, created_at, updated_at, name, is_group, avatar_url, group_id)
             VALUES (?, ?, ?, ?, 1, ?, ?)`
          ).run(convId.id, nowMs, nowMs, grp.name, grp.avatar_url, groupId);
        }
      }

      if (convId) {
        // Idempotent: avoid duplicate (conv, user) rows if a previous
        // join attempt was retried after a network blip.
        const existing = db
          .prepare(
            `SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`
          )
          .get(convId.id, myId);
        if (!existing) {
          db.prepare(
            `INSERT INTO conversation_participants (id, conversation_id, user_id, joined_at, role)
             VALUES (?, ?, ?, ?, 'member')`
          ).run(
            "cp_" + nowMs.toString(36) + Math.random().toString(36).slice(2, 11),
            convId.id,
            myId,
            nowMs
          );
        }
      }
    } catch (chatErr) {
      console.error("[groups join] failed to mirror into chat:", chatErr);
    }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true, role: "member" }, { status: 201, headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}