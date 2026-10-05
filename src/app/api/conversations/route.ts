import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { db } from "@/lib/db";
import {
  conversations,
  conversationParticipants,
  messages,
  users,
  readReceipts,
  groups,
} from "@/lib/db/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

function cuid() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

// GET /api/conversations — lấy danh sách hội thoại của user hiện tại
export async function GET(request: NextRequest) {
  const me = await getCurrentUser(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

  // Group conversations are kept in sync with the `groups` table: a
  // group chat only surfaces in the chat box when the viewer is
  // currently a member of the linked group. This stops:
  //   1. orphaned group chats (legacy rows with no `groups` row) from
  //      cluttering the list, and
  //   2. chats for groups the user left from re-appearing.
  // 1-1 conversations always show if I'm a participant.
  //
  // We LEFT JOIN `groups` so the response can fall back to the
  // group's current name + avatar. The chat box and the /groups
  // sidebar must display the same name — when the creator renames
  // the group, the chat header updates too without a separate write
  // to the `conversations` table.
  const userConversations = await db
    .select({
      id: conversations.id,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
      name: conversations.name,
      isGroup: conversations.isGroup,
      avatarUrl: conversations.avatarUrl,
      groupId: conversations.groupId,
      groupName: groups.name,
      groupAvatarUrl: groups.avatarUrl,
    })
    .from(conversations)
    .innerJoin(conversationParticipants, eq(conversationParticipants.conversationId, conversations.id))
    .leftJoin(groups, eq(groups.id, conversations.groupId))
    .where(
      and(
        eq(conversationParticipants.userId, me.id),
        sql`(${conversations.isGroup} = 0 OR (${conversations.groupId} IS NOT NULL AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = ${conversations.groupId} AND gm.user_id = ${me.id})))`
      )
    )
    .orderBy(desc(conversations.updatedAt));

  const result = await Promise.all(
    userConversations.map(async (conv) => {
      const participants = await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          avatar: users.avatar,
          // Group-chat role + nickname overrides. These are NULL for
          // 1-1 conversations so the chat UI can simply fall back to
          // users.name / avatar.
          role: conversationParticipants.role,
          nickname: conversationParticipants.nickname,
        })
        .from(users)
        .innerJoin(conversationParticipants, eq(conversationParticipants.userId, users.id))
        .where(eq(conversationParticipants.conversationId, conv.id));

      const [lastMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      // Count messages from other senders that have NOT been read by me
      const unreadCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .leftJoin(
          readReceipts,
          and(
            eq(readReceipts.messageId, messages.id),
            eq(readReceipts.userId, me.id)
          )
        )
        .where(
          and(
            eq(messages.conversationId, conv.id),
            sql`${messages.senderId} != ${me.id}`,
            sql`${readReceipts.id} IS NULL`
          )
        );

      return {
        ...conv,
        // For group chats, surface the linked group's name/avatar so
        // the chat header matches the /groups sidebar exactly. Falls
        // back to the conversation's own values when the link is
        // missing (1-1 chats) or the group row was deleted.
        name: conv.isGroup ? (conv.groupName ?? conv.name) : conv.name,
        avatarUrl: conv.isGroup
          ? (conv.groupAvatarUrl ?? conv.avatarUrl)
          : conv.avatarUrl,
        participants,
        lastMessage: lastMsg ?? null,
        unreadCount: unreadCount[0]?.count ?? 0,
      };
    })
  );

  return NextResponse.json(result, { headers: corsHeaders });
}

// POST /api/conversations — tạo hoặc mở cuộc trò chuyện
// Body shapes:
//   1-1 chat: { participantId: string }
//   Group  : { name: string, participantIds: string[] }
export async function POST(req: NextRequest) {
  const me = await getCurrentUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const { participantId, name, participantIds } = body as {
    participantId?: string;
    name?: string;
    participantIds?: string[];
  };

  // ─── Group chat ───────────────────────────────────────────────────────
  if (Array.isArray(participantIds) && participantIds.length >= 2) {
    // Validate + dedupe, exclude self from the "other" set since we add me
    const otherIds = Array.from(
      new Set(participantIds.filter((id) => id && id !== me.id))
    );
    if (otherIds.length < 2) {
      return NextResponse.json(
        { error: "Cần ít nhất 2 người khác để tạo nhóm" },
        { status: 400 }
      );
    }

    // Verify the target users actually exist
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, otherIds));
    if (existing.length !== otherIds.length) {
      return NextResponse.json(
        { error: "Có thành viên không tồn tại" },
        { status: 404 }
      );
    }

    const trimmedName = (name ?? "").trim().slice(0, 60) || "Nhóm mới";
    const now = new Date();
    const convId = cuid();

    await db.insert(conversations).values({
      id: convId,
      createdAt: now,
      updatedAt: now,
      name: trimmedName,
      isGroup: 1,
    });
    await db.insert(conversationParticipants).values([
      // The caller is the creator (also has admin powers) — explicitly
      // set role='creator' so the UI knows to show them the admin
      // controls (rename group, edit nicknames, promote, kick).
      {
        id: cuid(),
        userId: me.id,
        conversationId: convId,
        joinedAt: now,
        role: "creator",
      },
      // Newly invited members join as plain 'member'. An admin can
      // promote them later via PATCH /api/conversations/[id]/members.
      ...otherIds.map((uid) => ({
        id: cuid(),
        userId: uid,
        conversationId: convId,
        joinedAt: now,
        role: "member" as const,
      })),
    ]);

    return NextResponse.json(
      { id: convId, isGroup: true, existing: false },
      { status: 201, headers: corsHeaders }
    );
  }

  // ─── 1-1 chat (legacy) ────────────────────────────────────────────────
  if (!participantId) {
    return NextResponse.json({ error: "Thiếu participantId" }, { status: 400 });
  }

  // Tìm cuộc trò chuyện hiện có giữa 2 người
  const myConvs = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, me.id));

  for (const conv of myConvs) {
    const otherParticipants = await db
      .select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conv.conversationId));

    const otherIds = otherParticipants.map((p) => p.userId).sort();
    const expected = [me.id, participantId].sort();

    if (
      otherIds[0] === expected[0] &&
      otherIds[1] === expected[1] &&
      otherIds.length === 2
    ) {
      return NextResponse.json({ id: conv.conversationId, existing: true }, { headers: corsHeaders });
    }
  }

  // Tạo mới
  const now = new Date();
  const convId = cuid();
  await db.insert(conversations).values({ id: convId, createdAt: now, updatedAt: now });
  await db.insert(conversationParticipants).values([
    { id: cuid(), userId: me.id, conversationId: convId, joinedAt: now },
    { id: cuid(), userId: participantId, conversationId: convId, joinedAt: now },
  ]);

  return NextResponse.json({ id: convId, existing: false }, { status: 201, headers: corsHeaders });
}
