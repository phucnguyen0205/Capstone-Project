import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/posts/comments/[id]/replies
 * Returns replies (1-level) for the parent comment, with the same shape
 * used by /api/posts/[id]/comments. Soft-deleted rows included so the
 * UI can render a placeholder.
 */
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: corsHeaders },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = (await getSessionFromRequest(_req)) as {
    user?: { id: string };
  } | null;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId = session.user.id;
  const { id: parentId } = await params;

  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.id, c.user_id, c.post_id, c.parent_id, c.content,
                c.created_at, c.updated_at, c.edited, c.deleted_at,
                u.username, u.name as author_name, u.avatar as author_avatar
         FROM comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.parent_id = ?
         ORDER BY c.created_at ASC
         LIMIT 100`,
      )
      .all(parentId) as any[];

    const reactionsByComment: Record<string, Record<string, number>> = {};
    const myReactionsByComment: Record<string, string[]> = {};
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const reactRows = db
        .prepare(
          `SELECT comment_id, emoji, COUNT(*) as c
           FROM comment_reactions
           WHERE comment_id IN (${placeholders})
           GROUP BY comment_id, emoji`,
        )
        .all(...ids) as Array<{ comment_id: string; emoji: string; c: number }>;
      for (const r of reactRows) {
        (reactionsByComment[r.comment_id] ??= {})[r.emoji] = r.c;
      }
      const mineRows = db
        .prepare(
          `SELECT comment_id, emoji FROM comment_reactions
           WHERE user_id = ? AND comment_id IN (${placeholders})`,
        )
        .all(myId, ...ids) as Array<{ comment_id: string; emoji: string }>;
      for (const r of mineRows) {
        (myReactionsByComment[r.comment_id] ??= []).push(r.emoji);
      }
    }

    const mentionsByComment: Record<string, string[]> = {};
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const mentionRows = db
        .prepare(
          `SELECT comment_id, username FROM comment_mentions
           WHERE comment_id IN (${placeholders})`,
        )
        .all(...ids) as Array<{ comment_id: string; username: string }>;
      for (const r of mentionRows) {
        (mentionsByComment[r.comment_id] ??= []).push(r.username);
      }
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json(
      rows.map((c) => ({
        id: c.id,
        postId: c.post_id,
        parentId: c.parent_id,
        userId: c.user_id,
        content: c.deleted_at ? "" : c.content,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        edited: !!c.edited && !c.deleted_at,
        deleted: !!c.deleted_at,
        author: {
          id: c.user_id,
          username: c.username,
          name: c.author_name,
          avatar: c.author_avatar,
        },
        reactions: reactionsByComment[c.id] ?? {},
        myReactions: myReactionsByComment[c.id] ?? [],
        mentionUsernames: mentionsByComment[c.id] ?? [],
        replyCount: 0,
      })),
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