import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { createNotification } from "@/lib/notifications";

/**
 * GET  /api/posts/[id]/comments       — list comments for a post
 * POST /api/posts/[id]/comments       — add a comment
 *   Body: {
 *     content: string,
 *     parentId?: string,    // reply target (1-level threading)
 *   }
 *
 * Response shape (per comment):
 *   {
 *     id, postId, parentId?, userId, content, createdAt, updatedAt,
 *     edited, deleted,
 *     author: { id, username, name, avatar },
 *     reactions: { "👍": 2, "❤️": 1, ... },
 *     myReactions: ["👍", ...], // emoji the viewer already toggled on
 *     mentionUsernames: ["alice", "bob"], // snapshot of @handles
 *     replyCount: 3,
 *   }
 *
 * Note: this duplicates /api/interactions?action=comment to make the URL
 * cleaner. The interactions endpoint remains available for backwards compat.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "cm_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
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
  const { id: postId } = await params;
  const myId = session.user.id;

  try {
    const db = getDb();
    // Only top-level comments are listed; replies are loaded with their
    // parent. Soft-deleted rows are included with `deleted: true` so the
    // UI can render the "[deleted]" placeholder without breaking threads.
    const rows = db
      .prepare(
        `SELECT c.id, c.user_id, c.post_id, c.parent_id, c.content,
                c.created_at, c.updated_at, c.edited, c.deleted_at,
                u.username, u.name as author_name, u.avatar as author_avatar
         FROM comments c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ?
         ORDER BY c.created_at DESC
         LIMIT 200`,
      )
      .all(postId) as any[];

    // Aggregate reaction counts and which emojis the viewer picked.
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

    // Mention usernames (one row per resolved mention).
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

    // Reply counts: number of non-deleted children per top-level comment.
    const replyCounts: Record<string, number> = {};
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      const countRows = db
        .prepare(
          `SELECT parent_id, COUNT(*) as c FROM comments
           WHERE parent_id IN (${placeholders}) AND deleted_at IS NULL
           GROUP BY parent_id`,
        )
        .all(...ids) as Array<{ parent_id: string; c: number }>;
      for (const r of countRows) replyCounts[r.parent_id] = r.c;
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
        replyCount: replyCounts[c.id] ?? 0,
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
  const { id: postId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      content?: string;
      parentId?: string;
    };
    const content = (body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Nội dung bình luận trống" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (content.length > 1000) {
      return NextResponse.json(
        { error: "Bình luận tối đa 1000 ký tự" },
        { status: 400, headers: corsHeaders },
      );
    }

    const db = getDb();
    const post = db
      .prepare(`SELECT id, user_id FROM posts WHERE id = ? LIMIT 1`)
      .get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Không tìm thấy bài viết" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Reply target must exist on the same post and not be deleted.
    let parentComment: { id: string; user_id: string } | null = null;
    if (body.parentId) {
      parentComment = db
        .prepare(
          `SELECT id, user_id FROM comments
           WHERE id = ? AND post_id = ? AND deleted_at IS NULL LIMIT 1`,
        )
        .get(body.parentId, postId) as any;
      if (!parentComment) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json(
          { error: "Bình luận gốc không tồn tại" },
          { status: 404, headers: corsHeaders },
        );
      }
    }

    // Resolve @mentions. Match @username tokens against known users
    // (case-insensitive, alphanumeric + underscore + dot). Duplicate
    // mentions of the same handle collapse so we don't notify the same
    // user twice from a single comment.
    const handleRegex = /@([a-zA-Z0-9_.]{2,40})/g;
    const seen = new Set<string>();
    const mentionRecords: Array<{ username: string; userId: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = handleRegex.exec(content)) !== null) {
      const handle = m[1].toLowerCase();
      if (seen.has(handle)) continue;
      seen.add(handle);
      const u = db
        .prepare(`SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1`)
        .get(handle) as { id: string } | undefined;
      if (u && u.id !== myId) {
        mentionRecords.push({ username: handle, userId: u.id });
      }
    }

    const id =
      "cm_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 10);
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO comments
         (id, user_id, post_id, parent_id, content, created_at, updated_at, edited)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(id, myId, postId, parentComment?.id ?? null, content, now, now);

    // Persist the resolved mentions so the bell fan-out can find them.
    if (mentionRecords.length > 0) {
      const mStmt = db.prepare(
        `INSERT INTO comment_mentions (id, comment_id, user_id, username, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const mr of mentionRecords) {
        mStmt.run(
          "mn_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 10),
          id,
          mr.userId,
          mr.username,
          now,
        );
      }
    }

    const author = db
      .prepare(`SELECT id, username, name, avatar FROM users WHERE id = ?`)
      .get(myId) as any;

    const preview =
      content.length > 80 ? content.slice(0, 80) + "…" : content;
    const actorName = author?.name || author?.username || "Ai đó";

    // Bell notifications — best-effort, never throw out of the create.
    try {
      // (a) Reply notification (only when this comment is a reply and the
      // recipient isn't the actor).
      if (
        parentComment &&
        parentComment.user_id &&
        parentComment.user_id !== myId
      ) {
        createNotification({
          recipientId: parentComment.user_id,
          actorId: myId,
          type: "comment",
          title: `${actorName} đã trả lời bình luận của bạn`,
          body: preview,
          data: { postId, commentId: id, parentId: parentComment.id },
        });
      }

      // (b) Comment notification on the post (skip self-comments).
      if (post.user_id && post.user_id !== myId) {
        createNotification({
          recipientId: post.user_id,
          actorId: myId,
          type: "comment",
          title: `${actorName} đã bình luận về bài viết của bạn`,
          body: preview,
          data: { postId, commentId: id },
        });
      }

      // (c) @mention notifications. Each handle gets a bell with the same
      // preview text and a deep-link back to the comment.
      for (const mr of mentionRecords) {
        createNotification({
          recipientId: mr.userId,
          actorId: myId,
          type: "mention",
          title: `${actorName} đã nhắc đến bạn`,
          body: preview,
          data: { postId, commentId: id },
        });
      }
    } catch {
      // best-effort — comment still saved.
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      {
        id,
        postId,
        parentId: parentComment?.id ?? null,
        userId: myId,
        content,
        createdAt: now,
        updatedAt: now,
        edited: false,
        deleted: false,
        author: {
          id: myId,
          username: author?.username ?? null,
          name: author?.name ?? null,
          avatar: author?.avatar ?? null,
        },
        reactions: {},
        myReactions: [],
        mentionUsernames: mentionRecords.map((r) => r.username),
        replyCount: 0,
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}