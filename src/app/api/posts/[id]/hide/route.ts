import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST /api/posts/[id]/hide
 *
 * Two flavors of "hide" are supported:
 *   1) Hide from MY feed      (hide my own / or any visible post)
 *      body: { scope: "feed" }
 *   2) Hide from SPECIFIC users (author-only — restricts viewers)
 *      body: { scope: "users", userIds: [...] }
 *
 * GET /api/posts/[id]/hide
 *   Returns { hiddenFromFeed: boolean, hiddenFromUsers: [...] } for the
 *   current viewer (and, for author, the list of users the post is hidden
 *   from).
 *
 * DELETE /api/posts/[id]/hide?scope=feed   — undo hide from feed
 * DELETE /api/posts/[id]/hide?scope=users&userId=X — stop hiding from X
 */
export const dynamic = "force-dynamic";

function ensureTables(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_hides (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      target_user_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(post_id, user_id, scope, target_user_id)
    );
  `);
}

function cuid() {
  return (
    "hd_" +
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
  const session = await getSessionFromRequest(_req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: postId } = await params;

  try {
    const db = getDb();
    ensureTables(db);
    const feedRow = db
      .prepare(`SELECT id FROM post_hides WHERE post_id = ? AND user_id = ? AND scope = 'feed' LIMIT 1`)
      .get(postId, myId);
    const hiddenFromRows = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar
         FROM post_hides h
         JOIN users u ON u.id = h.target_user_id
         WHERE h.post_id = ? AND h.user_id = ? AND h.scope = 'users'`
      )
      .all(postId, myId) as any[];
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({
      hiddenFromFeed: !!feedRow,
      hiddenFromUsers: hiddenFromRows.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        avatar: u.avatar,
      })),
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: postId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      scope?: string;
      userIds?: string[];
    };
    const scope = (body.scope ?? "feed").toLowerCase();

    const db = getDb();
    ensureTables(db);
    const post = db.prepare(`SELECT id, user_id FROM posts WHERE id = ?`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }

    if (scope === "feed") {
      // Hide from MY feed
      db.prepare(
        `INSERT OR IGNORE INTO post_hides (id, post_id, user_id, scope, target_user_id, created_at)
         VALUES (?, ?, ?, 'feed', NULL, ?)`
      ).run(cuid(), postId, myId, Math.floor(Date.now() / 1000));
    } else if (scope === "users") {
      // Hide from specific users — only the author may do this
      if (post.user_id !== myId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json(
          { error: "Chỉ chủ bài viết mới có thể ẩn với người cụ thể" },
          { status: 403 }
        , { headers: corsHeaders });
      }
      const ids = (body.userIds ?? []).filter(Boolean);
      if (ids.length === 0) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ error: "Thiếu danh sách userId" }, { status: 400 }, { headers: corsHeaders });
      }
      for (const uid of ids) {
        if (uid === myId) continue;
        const u = db.prepare(`SELECT id FROM users WHERE id = ?`).get(uid);
        if (!u) continue;
        db.prepare(
          `INSERT OR IGNORE INTO post_hides (id, post_id, user_id, scope, target_user_id, created_at)
           VALUES (?, ?, ?, 'users', ?, ?)`
        ).run(cuid(), postId, myId, uid, Math.floor(Date.now() / 1000));
      }
    } else {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "scope không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
    }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: postId } = await params;
  const url = new URL(req.url);
  const scope = (url.searchParams.get("scope") ?? "feed").toLowerCase();
  const targetUserId = url.searchParams.get("userId");

  try {
    const db = getDb();
    ensureTables(db);
    if (scope === "users" && targetUserId) {
      db.prepare(
        `DELETE FROM post_hides
         WHERE post_id = ? AND user_id = ? AND scope = 'users' AND target_user_id = ?`
      ).run(postId, myId, targetUserId);
    } else {
      db.prepare(
        `DELETE FROM post_hides WHERE post_id = ? AND user_id = ? AND scope = ?`
      ).run(postId, myId, scope);
    }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}