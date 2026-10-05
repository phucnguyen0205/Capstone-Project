import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST /api/posts/[id]/dismiss
 *
 * "See less from this channel / author" — reduces the priority of posts from
 * the post's author in the viewer's feed (similar to Instagram's "See less often").
 *
 * Body: { action: "dismiss" | "undo" }
 *   dismiss — add the author to the viewer's "dismissed authors" list
 *   undo    — remove the author from that list
 *
 * The feed API reads this list to deprioritise (not hide) posts from those authors.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "dm_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  ); 
}


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const viewerId = (session.user as any).id;
  const { id: postId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action === "undo" ? "undo" : "dismiss";

    const db = getDb();

    // Get the author of the post
    const post = db.prepare(`SELECT id, user_id FROM posts WHERE id = ? LIMIT 1`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }

    const authorId = post.user_id;

    // Don't dismiss yourself
    if (authorId === viewerId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không thể giảm ưu tiên bài viết của chính mình" }, { status: 400 }, { headers: corsHeaders });
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS dismissed_authors (
        id TEXT PRIMARY KEY,
        viewer_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(viewer_id, author_id)
      );
    `);

    const now = Math.floor(Date.now() / 1000);

    if (action === "dismiss") {
      db.prepare(`
        INSERT OR IGNORE INTO dismissed_authors (id, viewer_id, author_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(genId(), viewerId, authorId, now);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ ok: true, dismissed: true }, { headers: corsHeaders });
    } else {
      db.prepare(`
        DELETE FROM dismissed_authors WHERE viewer_id = ? AND author_id = ?
      `).run(viewerId, authorId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ ok: true, dismissed: false }, { headers: corsHeaders });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
