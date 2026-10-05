import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/posts/comments/[id]/reaction
 *   Body: { emoji: string }   // "👍", "😂", "❤️", "😮", "😢", "🔥"
 *
 * Toggle: if the user already has this emoji on the comment, remove it;
 * otherwise insert it. Returns the current aggregated reactions map and
 * the viewer's own active emojis.
 *
 * Notifies the comment author (skip self) the first time any reaction is
 * added by this user for this comment so we don't re-notify on every toggle.
 */
export const dynamic = "force-dynamic";

const ALLOWED_EMOJIS = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥"]);

function genId() {
  return (
    "cr_" +
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
    const body = (await req.json().catch(() => ({}))) as { emoji?: string };
    const emoji = (body.emoji ?? "").trim();
    if (!ALLOWED_EMOJIS.has(emoji)) {
      return NextResponse.json(
        { error: "Emoji không hợp lệ" },
        { status: 400, headers: corsHeaders },
      );
    }

    const db = getDb();
    const comment = db
      .prepare(
        `SELECT c.id, c.user_id, c.post_id, c.deleted_at
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

    // Toggle: remove if exists, otherwise insert.
    const existing = db
      .prepare(
        `SELECT id FROM comment_reactions
         WHERE comment_id = ? AND user_id = ? AND emoji = ? LIMIT 1`,
      )
      .get(commentId, myId, emoji) as { id: string } | undefined;

    let action: "added" | "removed";
    if (existing) {
      db.prepare(
        `DELETE FROM comment_reactions WHERE id = ?`,
      ).run(existing.id);
      action = "removed";
    } else {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        `INSERT INTO comment_reactions (id, comment_id, user_id, emoji, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(genId(), commentId, myId, emoji, now);
      action = "added";
    }

    // Recompute aggregated counts + viewer's active set for this comment.
    const counts = db
      .prepare(
        `SELECT emoji, COUNT(*) as c FROM comment_reactions
         WHERE comment_id = ? GROUP BY emoji`,
      )
      .all(commentId) as Array<{ emoji: string; c: number }>;
    const mine = db
      .prepare(
        `SELECT emoji FROM comment_reactions
         WHERE comment_id = ? AND user_id = ?`,
      )
      .all(commentId, myId) as Array<{ emoji: string }>;

    // Notify the comment author the first time *any* emoji is added by
    // this viewer. We piggy-back on the post's data so the bell has a
    // deep-link back to the comment.
    if (
      action === "added" &&
      comment.user_id &&
      comment.user_id !== myId
    ) {
      try {
        const author = db
          .prepare(`SELECT name, username FROM users WHERE id = ?`)
          .get(myId) as any;
        const actorName = author?.name || author?.username || "Ai đó";
        // Skip if the viewer has already reacted with any emoji on this
        // comment before — only fire the bell on the *first* reaction
        // from this viewer to avoid spam.
        const alreadyReacted = db
          .prepare(
            `SELECT COUNT(*) as c FROM comment_reactions
             WHERE comment_id = ? AND user_id = ?`,
          )
          .get(commentId, myId) as { c: number };
        if (alreadyReacted.c <= 1) {
          createNotification({
            recipientId: comment.user_id,
            actorId: myId,
            type: "comment",
            title: `${actorName} đã thả cảm xúc về bình luận của bạn`,
            body: `${emoji} về bình luận của bạn`,
            data: { postId: comment.post_id, commentId, reaction: emoji },
          });
        }
      } catch {
        // best-effort
      }
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      {
        ok: true,
        action,
        reactions: Object.fromEntries(counts.map((c) => [c.emoji, c.c])),
        myReactions: mine.map((m) => m.emoji),
      },
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