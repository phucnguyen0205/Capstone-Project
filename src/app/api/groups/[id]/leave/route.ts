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
 * POST /api/groups/[id]/leave
 *
 * Caller leaves the group. Creators cannot leave their own group —
 * they must either promote a replacement (TODO: ownership transfer)
 * or delete the group.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(_request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { id: groupId } = await params;
  const role = await getMemberRole(me.id, groupId);
  if (role === null) {
    return NextResponse.json(
      { error: "Bạn không phải thành viên nhóm này" },
      { status: 404, headers: corsHeaders }
    );
  }
  if (role === "creator") {
    return NextResponse.json(
      { error: "Người tạo không thể rời nhóm. Hãy xóa nhóm nếu muốn." },
      { status: 400, headers: corsHeaders }
    );
  }

  await db
    .delete(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, me.id)
      )
    );

  // Mirror the leave into the chat layer so the chat box for this
  // group no longer surfaces the conversation for the leaver. We use
  // raw SQL here because the legacy `conversation_participants` table
  // isn't fully modelled in the Drizzle schema.
  try {
    const { getDb } = await import("@/lib/db/server");
    const db = getDb();
    db.prepare(
      `DELETE FROM conversation_participants
       WHERE user_id = ?
         AND conversation_id IN (
           SELECT id FROM conversations WHERE group_id = ?
         )`
    ).run(me.id, groupId);
  } catch (chatErr) {
    // best-effort: group leave itself succeeded; chat mirror is a
    // nice-to-have.
    console.error("[groups leave] failed to mirror into chat:", chatErr);
  }

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}