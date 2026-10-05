import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages, readReceipts, conversationParticipants } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

function cuid() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

// GET /api/conversations/[id]/messages

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const { id: conversationId } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const before = searchParams.get("before");
  const q = searchParams.get("q")?.trim() ?? "";

  // Verify user is participant
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
    return NextResponse.json(
      { error: "Không có quyền truy cập" },
      { status: 403, headers: corsHeaders }
    );
  }

  const conditions = [eq(messages.conversationId, conversationId)];
  if (before) {
    conditions.push(
      // @ts-ignore
      eq(messages.createdAt, new Date(before))
    );
  }
  if (q) {
    // Case-insensitive content search. LIKE on SQLite is already
    // case-insensitive for ASCII; LOWER() covers the rest. We don't
    // index content — the conversations table is small enough that a
    // full scan per page is fine, and search is a rare user action.
    conditions.push(
      sql`LOWER(${messages.content}) LIKE ${"%" + q.toLowerCase() + "%"}`
    );
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Mark all messages from other senders as read for this user
  // We only mark messages that we just read (in the fetched set)
  const now = new Date();
  const unreadFromOthers = msgs.filter((m) => m.senderId !== me.id);
  if (unreadFromOthers.length > 0) {
    // Insert read receipts (ignore duplicates via composite uniqueness assumption)
    for (const msg of unreadFromOthers) {
      try {
        await db.insert(readReceipts).values({
          id: `rr_${msg.id}_${me.id}`,
          userId: me.id,
          messageId: msg.id,
          readAt: now,
        });
      } catch {
        // Ignore unique constraint violations (already read)
      }
    }
  }

  return NextResponse.json(msgs.reverse(), { headers: corsHeaders });
}

// POST /api/conversations/[id]/messages
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  const { id: conversationId } = await params;
  const { content, mediaUrl, mediaType, fileName, fileSize } = await request.json();

  // Allow attachment-only messages if mediaUrl+mediaType are present, otherwise content is required
  if (!content?.trim() && !mediaUrl) {
    return NextResponse.json(
      { error: "Thiếu nội dung" },
      { status: 400, headers: corsHeaders }
    );
  }

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
    return NextResponse.json(
      { error: "Không có quyền" },
      { status: 403, headers: corsHeaders }
    );
  }

  const now = new Date();
  const msgId = cuid();

  // Build the visible content. Attachments-only messages use the file name as
  // content so the recipient sees what was sent.
  const finalContent = (content?.trim() || "") || (mediaUrl ? `[Tệp] ${fileName || "đính kèm"}` : "");

  await db.insert(messages).values({
    id: msgId,
    content: finalContent,
    mediaUrl: mediaUrl ?? null,
    mediaType: mediaType ?? null,
    fileName: fileName ?? null,
    fileSize: typeof fileSize === "number" ? fileSize : null,
    senderId: me.id,
    conversationId,
    createdAt: now,
    updatedAt: now,
  });

  const [msg] = await db.select().from(messages).where(eq(messages.id, msgId)).limit(1);
  return NextResponse.json(msg, { status: 201, headers: corsHeaders });
}
