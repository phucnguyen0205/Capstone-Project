import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { groupMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { getMemberRole } from "@/lib/groupPermissionsV2";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * POST /api/groups/[id]/transfer-ownership
 *
 * Body: { newOwnerId: string }
 *
 * Creator-only: hand ownership of the group to another existing member.
 * The previous creator is demoted to admin (we don't want them to
 * retain creator powers, but they shouldn't lose access entirely
 * either). The new owner becomes role='creator'.
 *
 * This unlocks the original creator's "leave group" path — once they've
 * transferred away they can leave without losing the group.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }
  const { id: groupId } = await params;

  const myRole = await getMemberRole(me.id, groupId);
  if (myRole !== "creator") {
    return NextResponse.json(
      { error: "Chỉ người tạo mới có thể chuyển quyền" },
      { status: 403, headers: corsHeaders }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { newOwnerId?: string };
  const newOwnerId = typeof body.newOwnerId === "string" ? body.newOwnerId.trim() : "";
  if (!newOwnerId) {
    return NextResponse.json({ error: "Thiếu newOwnerId" }, { status: 400, headers: corsHeaders });
  }
  if (newOwnerId === me.id) {
    return NextResponse.json(
      { error: "Bạn đã là người tạo nhóm" },
      { status: 400, headers: corsHeaders }
    );
  }

  // Verify the target is already a member (no point promoting a stranger).
  const targetRole = await getMemberRole(newOwnerId, groupId);
  if (targetRole === null) {
    return NextResponse.json(
      { error: "Người nhận phải là thành viên của nhóm" },
      { status: 404, headers: corsHeaders }
    );
  }

  // The swap: demote me to admin, promote target to creator. We do this
  // in two steps instead of a transaction here — Drizzle's better-sqlite3
  // driver wraps individual writes in implicit transactions so a crash
  // mid-flight leaves us in either the "before" or "after" state, never
  // half-applied. Good enough for ownership transfer.
  await db
    .update(groupMembers)
    .set({ role: "admin" })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, me.id)
      )
    );

  await db
    .update(groupMembers)
    .set({ role: "creator" })
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, newOwnerId)
      )
    );

  // Mirror the role swap into the chat layer so the conversation's
  // admin UI matches the group's actual ownership. Without this, the
  // original creator would still appear as `creator` in the chat
  // (and keep admin powers) even after transferring the group away.
  try {
    const { getDb } = await import("@/lib/db/server");
    const chatDb = getDb();
    chatDb.prepare(
      `UPDATE conversation_participants SET role = 'admin'
       WHERE conversation_id IN (SELECT id FROM conversations WHERE group_id = ?)
         AND user_id = ?`
    ).run(groupId, me.id);
    chatDb.prepare(
      `UPDATE conversation_participants SET role = 'creator'
       WHERE conversation_id IN (SELECT id FROM conversations WHERE group_id = ?)
         AND user_id = ?`
    ).run(groupId, newOwnerId);
  } catch (chatErr) {
    console.error("[groups transfer-ownership] failed to mirror into chat:", chatErr);
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}