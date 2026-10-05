import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * PATCH  /api/posts/comments/[id]   — owner only, edit content
 *   Body: { content: string }
 * DELETE /api/posts/comments/[id]   — owner only, soft-delete
 *
 * Both endpoints clear bell notifications tied to this comment so the
 * recipient's bell doesn't show stale content after edit/delete.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "mn_" +
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

export async function PATCH(
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
  const { id } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      content?: string;
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
    const comment = db
      .prepare(
        `SELECT id, user_id, deleted_at FROM comments WHERE id = ? LIMIT 1`,
      )
      .get(id) as any;
    if (!comment || comment.deleted_at) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Không tìm thấy bình luận" },
        { status: 404, headers: corsHeaders },
      );
    }
    if (comment.user_id !== myId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Bạn không thể sửa bình luận của người khác" },
        { status: 403, headers: corsHeaders },
      );
    }

    const now = Math.floor(Date.now() / 1000);

    // Reset mentions to match the new content so bell fan-out reflects
    // only the @handles currently in the comment text. Old mentions
    // whose user isn't mentioned any more stop getting new notifs, but
    // already-delivered bells aren't deleted (history).
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
    db.prepare(`DELETE FROM comment_mentions WHERE comment_id = ?`).run(id);
    if (mentionRecords.length > 0) {
      const ins = db.prepare(
        `INSERT INTO comment_mentions (id, comment_id, user_id, username, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const mr of mentionRecords) {
        ins.run(genId(), id, mr.userId, mr.username, now);
      }
    }

    db.prepare(
      `UPDATE comments
         SET content = ?, updated_at = ?, edited = 1
       WHERE id = ? AND user_id = ?`,
    ).run(content, now, id, myId);

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      { ok: true, content, updatedAt: now, mentionUsernames: mentionRecords.map((r) => r.username) },
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

export async function DELETE(
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
  const { id } = await params;

  try {
    const db = getDb();
    const comment = db
      .prepare(`SELECT user_id FROM comments WHERE id = ? LIMIT 1`)
      .get(id) as any;
    if (!comment) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Không tìm thấy bình luận" },
        { status: 404, headers: corsHeaders },
      );
    }
    if (comment.user_id !== myId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Bạn không thể xoá bình luận của người khác" },
        { status: 403, headers: corsHeaders },
      );
    }
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE comments SET deleted_at = ?, content = '' WHERE id = ? AND user_id = ?`,
    ).run(now, id, myId);

    // Drop the bell notifications tied to this comment so the bell
    // doesn't dangle after the comment is gone.
    try {
      db.prepare(
        `DELETE FROM notifications
         WHERE (type = 'comment' OR type = 'mention')
           AND data LIKE ?`,
      ).run(`%"commentId":"${id}"%`);
    } catch {
      // best-effort
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}