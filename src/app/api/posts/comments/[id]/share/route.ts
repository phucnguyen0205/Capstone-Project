import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/posts/comments/[id]/share
 *   Body: { recipients?: string[] }   // optional future target audience
 *
 * Records a share event on the comment, returns it. Notifies the comment
 * author (skip self) with a `share` bell. The actual recipient list is
 * reserved for future "share to DM" workflows — for now we just bump a
 * counter and fire a single bell.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "cs_" +
    Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10)
  );
}

export async function OPTIONS() {
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: corsHeaders },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = (await getSessionFromRequest(req)) as {
    user?: { id: string };
  } | null;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId = session.user.id;
  const { id: commentId } = await params;

  try {
    await req.json().catch(() => ({})); // body optional
    const db = getDb();
    const comment = db
      .prepare(
        `SELECT c.id, c.user_id, c.post_id, c.content, c.deleted_at
         FROM comments c WHERE c.id = ? LIMIT 1`,
      )
      .get(commentId) as any;
    if (!comment || comment.deleted_at) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Không tìm thấy bình luận" },
        { status: 404, headers: corsHeaders },
      );
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO comment_shares (id, comment_id, user_id, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(genId(), commentId, myId, now);

    const total = db
      .prepare(
        `SELECT COUNT(*) as c FROM comment_shares WHERE comment_id = ?`,
      )
      .get(commentId) as { c: number };

    // Notify the comment author (skip self).
    if (comment.user_id && comment.user_id !== myId) {
      try {
        const author = db
          .prepare(`SELECT name, username FROM users WHERE id = ?`)
          .get(myId) as any;
        const actorName = author?.name || author?.username || "Ai đó";
        createNotification({
          recipientId: comment.user_id,
          actorId: myId,
          type: "share",
          title: `${actorName} đã chia sẻ bình luận của bạn`,
          body: comment.content
            ? comment.content.length > 80
              ? comment.content.slice(0, 80) + "…"
              : comment.content
            : null,
          data: { postId: comment.post_id, commentId },
        });
      } catch {
        // best-effort
      }
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json(
      { ok: true, shareCount: total.c },
      { headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}