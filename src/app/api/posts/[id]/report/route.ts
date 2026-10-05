import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST /api/posts/[id]/report
 *
 * Body: { reason: "spam" | "harassment" | "misinformation" | "nudity" | "violence" | "other", description?: string }
 *
 * Reports a post to moderators. The reporter's identity is stored; a moderator
 * dashboard (out of scope here) would review these reports.
 *
 * One report per (user, post) pair; re-reporting the same post updates
 * the reason and description.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "rp_" +
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
  const reporterId = (session.user as any).id;
  const { id: postId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      reason?: string;
      description?: string;
    };

    const validReasons = ["spam", "harassment", "misinformation", "nudity", "violence", "other"] as const;
    const rawReason = body.reason ?? "other";
    const reason = validReasons.includes(rawReason as typeof validReasons[number]) ? rawReason : "other";
    const description = typeof body.description === "string" && body.description ? body.description.trim().slice(0, 500) : "";

    const db = getDb();

    // Verify post exists
    const post = db.prepare(`SELECT id, user_id FROM posts WHERE id = ? LIMIT 1`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }

    // Cannot report your own post
    if (post.user_id === reporterId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không thể báo cáo bài viết của chính mình" }, { status: 400 }, { headers: corsHeaders });
    }

    // Ensure table
    db.exec(`
      CREATE TABLE IF NOT EXISTS post_reports (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(post_id, reporter_id)
      );
    `);

    const now = Math.floor(Date.now() / 1000);
    const id = genId();

    db.prepare(`
      INSERT INTO post_reports (id, post_id, reporter_id, reason, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(post_id, reporter_id) DO UPDATE SET
        reason = excluded.reason,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(id, postId, reporterId, reason, description, now, now);

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true, message: "Đã gửi báo cáo. Cảm ơn bạn!" }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
