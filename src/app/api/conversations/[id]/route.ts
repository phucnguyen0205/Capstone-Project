import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, conversationParticipants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { assertAdmin } from "@/lib/groupPermissions";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * PATCH /api/conversations/[id]
 *
 * Update the conversation name (for groups: visible to all members,
 * for 1-1: only the caller sees it because we don't persist a per-user
 * nickname in the schema — the schema only has a single `name` column;
 * for 1-1 we still accept it but display fallback in `ChatColumn`).
 *
 * Only participants of the conversation may rename it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }, { headers: corsHeaders });
  }

  const { id: conversationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { name?: string };

  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "Thiếu tên cuộc trò chuyện" }, { status: 400 }, { headers: corsHeaders });
  }

  const trimmed = body.name.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Tên không được để trống" }, { status: 400 }, { headers: corsHeaders });
  }
  if (trimmed.length > 60) {
    return NextResponse.json({ error: "Tên tối đa 60 ký tự" }, { status: 400 }, { headers: corsHeaders });
  }

  // Verify the caller is an admin/creator of the group. Any member can
  // still chat, but renaming is an admin-only operation.
  const adminErr = await assertAdmin(me.id, conversationId);
  if (adminErr) {
    return NextResponse.json(adminErr, { status: adminErr.status, headers: corsHeaders });
  }

  const now = new Date();
  await db
    .update(conversations)
    .set({ name: trimmed, updatedAt: now })
    .where(eq(conversations.id, conversationId));

  return NextResponse.json({ ok: true, name: trimmed }, { headers: corsHeaders });
}

/**
 * DELETE /api/conversations/[id]
 *
 * Leave (or delete if group owner) the conversation.
 * For 1-1: removes the caller's participant row.
 * For groups: removes the caller's participant row. The conversation itself
 * is kept (so other members can keep chatting). Use /api/conversations to
 * create new ones.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }, { headers: corsHeaders });
  }

  const { id: conversationId } = await params;

  // Verify the caller is a participant
  const participant = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, me.id)
      )
    )
    .limit(1);

  if (participant.length === 0) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 }, { headers: corsHeaders });
  }

  await db
    .delete(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, me.id)
      )
    );

  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}