import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST   /api/posts/[id]/save       — bookmark the post (toggle: saves if missing, removes if existing)
 * DELETE /api/posts/[id]/save       — force-remove bookmark
 * GET    /api/posts/[id]/save       — boolean { saved: true|false }
 *
 * The POST endpoint behaves as a toggle to keep the UI simple; clients that
 * need a strict idempotent add/remove can use POST once and DELETE to undo.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "sv_" +
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
    const row = db
      .prepare(`SELECT id FROM saves WHERE user_id = ? AND post_id = ? LIMIT 1`)
      .get(myId, postId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ saved: !!row }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function POST(
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
    const post = db.prepare(`SELECT id FROM posts WHERE id = ? LIMIT 1`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }

    const existing = db
      .prepare(`SELECT id FROM saves WHERE user_id = ? AND post_id = ? LIMIT 1`)
      .get(myId, postId) as any;

    if (existing) {
      db.prepare(`DELETE FROM saves WHERE id = ?`).run(existing.id);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ saved: false }, { headers: corsHeaders });
    }

    const id = genId();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO saves (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)`
    ).run(id, myId, postId, now);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ saved: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function DELETE(
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
    db.prepare(`DELETE FROM saves WHERE user_id = ? AND post_id = ?`).run(myId, postId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ saved: false }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}