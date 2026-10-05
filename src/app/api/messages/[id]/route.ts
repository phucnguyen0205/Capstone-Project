import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, conversationParticipants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

/**
 * DELETE /api/messages/[id]
 *
 * Soft-deletes a message (only the sender can delete their own messages).
 * Returns 204 on success, 403 if the user is not the sender.
 */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }, { headers: corsHeaders });

  const { id: messageId } = await params;

  // Fetch the message first
  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!msg) {
    return NextResponse.json({ error: "Không tìm thấy tin nhắn" }, { status: 404 }, { headers: corsHeaders });
  }

  // Only the sender may delete their own message
  if (msg.senderId !== me.id) {
    return NextResponse.json(
      { error: "Bạn chỉ có thể xoá tin nhắn của chính mình" },
      { status: 403 }
    , { headers: corsHeaders });
  }

  // Verify caller is still a participant of the conversation
  const participant = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, msg.conversationId),
        eq(conversationParticipants.userId, me.id)
      )
    )
    .limit(1);
  if (participant.length === 0) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 }, { headers: corsHeaders });
  }

  // Hard delete — chat messages are ephemeral and there is no audit log requirement
  await db.delete(messages).where(eq(messages.id, messageId));

  return new NextResponse(null, { status: 204 });
}
