import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversations, conversationParticipants, users } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { assertAdmin, isGroupConversation } from "@/lib/groupPermissions";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * POST /api/conversations/[id]/members
 *
 * Body: { userId: string }
 *
 * Admin/creator-only: manually add an existing user to the group. This
 * intentionally has NO auto-add flow — every member must be picked
 * explicitly by an admin. The body only accepts one userId at a time
 * so the admin can confirm each addition.
 *
 * Returns 201 on success, 409 if the user is already a member.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { id: conversationId } = await params;
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!userId) {
    return NextResponse.json(
      { error: "Thiếu userId" },
      { status: 400, headers: corsHeaders }
    );
  }
  if (userId === me.id) {
    return NextResponse.json(
      { error: "Bạn đã ở trong nhóm" },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!(await isGroupConversation(conversationId))) {
    return NextResponse.json(
      { error: "Chỉ áp dụng cho cuộc trò chuyện nhóm" },
      { status: 400, headers: corsHeaders }
    );
  }

  const err = await assertAdmin(me.id, conversationId);
  if (err) return NextResponse.json(err, { status: err.status, headers: corsHeaders });

  // Verify the target user actually exists
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json(
      { error: "Người dùng không tồn tại" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Reject if the user is already a member
  const [existing] = await db
    .select({ id: conversationParticipants.id })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    )
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "Người dùng đã là thành viên" },
      { status: 409, headers: corsHeaders }
    );
  }

  const cuid = () => {
    const ts = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 11);
    return `cp_${ts}${r}`;
  };

  await db.insert(conversationParticipants).values({
    id: cuid(),
    userId,
    conversationId,
    joinedAt: new Date(),
    // Plain member. Promote them to admin via PATCH .../members/[userId]
    // with role='admin' once they've proven themselves.
    role: "member",
  });

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  return NextResponse.json({ ok: true, userId }, { status: 201, headers: corsHeaders });
}