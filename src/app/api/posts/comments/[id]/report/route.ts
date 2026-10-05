import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST /api/posts/comments/[id]/report
 *
 * Body: { reason: "spam" | "harassment" | "misinformation" | "nudity" | "violence" | "other", description?: string }
 *
 * Reports a comment. One report per (user, comment) pair.
 */
export const dynamic = "force-dynamic";

function genId() {
  return (
    "rc_" +
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
  const { id: commentId } = await params;

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

    // Verify comment exists
    const comment = db.prepare(`SELECT id, user_id FROM comments WHERE id = ? LIMIT 1`).get(commentId) as any;
    if (!comment) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bình luận" }, { status: 404 }, { headers: corsHeaders });
    }

    // Cannot report your own comment
    if (comment.user_id === reporterId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không thể báo cáo bình luận của chính mình" }, { status: 400 }, { headers: corsHeaders });
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS comment_reports (
        id TEXT PRIMARY KEY,
        comment_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(comment_id, reporter_id)
      );
    `);

    const now = Math.floor(Date.now() / 1000);
    const id = genId();

    db.prepare(`
      INSERT INTO comment_reports (id, comment_id, reporter_id, reason, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(comment_id, reporter_id) DO UPDATE SET
        reason = excluded.reason,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(id, commentId, reporterId, reason, description, now, now);

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true, message: "Đã gửi báo cáo. Cảm ơn bạn!" }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
