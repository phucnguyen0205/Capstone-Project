import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { createNotification } from "@/lib/notifications";

/**
 * POST /api/posts/[id]/share
 *
 * Body: { type: "friend" | "group" | "copy", targets?: string[] }
 *   - friend : share to specific friends (targets = user ids)
 *   - group  : share to a group (target = group id; groups not yet fully
 *              implemented — fallback to copy-link only)
 *   - copy   : copy the link to clipboard (client-side)
 *
 * Records each share in a `shares` table. A shared post is then visible to
 * the targeted recipient through the normal feed (we don't duplicate the
 * post; we let them see it via /api/users/[id]/posts when they look at the
 * sharer's profile, OR via a dedicated "Shared with me" feed).
 *
 * GET /api/posts/[id]/share
 *   Returns { shareCount, sharedByMe } for the viewer.
 *
 * DELETE /api/posts/[id]/share
 *   Remove a share (called when the viewer un-shares a post).
 */
export const dynamic = "force-dynamic";

function ensureTables(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(post_id, user_id, target_type, target_id)
    );
  `);
}

function cuid() {
  return (
    "sh_" +
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
    const total = (db
      .prepare(`SELECT COUNT(*) as c FROM shares WHERE post_id = ?`)
      .get(postId) as any).c as number;
    const mine = db
      .prepare(`SELECT id FROM shares WHERE post_id = ? AND user_id = ?`)
      .get(postId, myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({
      shareCount: total,
      sharedByMe: !!mine,
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
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: postId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      type?: string;
      targets?: string[];
      targetId?: string;
    };
    const type = (body.type ?? "copy").toLowerCase();

    if (!["friend", "group", "copy"].includes(type)) {
      return NextResponse.json({ error: "Loại chia sẻ không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
    }

    const db = getDb();
    ensureTables(db);

    const post = db.prepare(`SELECT id, user_id FROM posts WHERE id = ?`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }

    if (type === "copy") {
      // We don't record a share row for copy-link (no recipient), just
      // acknowledge and let the client copy the URL.
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ ok: true, type: "copy", shareCount: 0 }, { headers: corsHeaders });
    }

    // Share to friends / groups — record each (or single) target.
    const targets = (body.targets ?? (body.targetId ? [body.targetId] : [])).filter(
      Boolean
    );
    if (targets.length === 0) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(
        { error: "Thiếu danh sách người nhận / nhóm nhận" },
        { status: 400 }
      , { headers: corsHeaders });
    }

    // Enforce: sharing to friends means the viewer must already follow the
    // target (otherwise we silently drop). For groups, only the group's
    // owner can share to it — but we don't yet have groups, so accept any.
    if (type === "friend") {
      for (const tid of targets) {
        if (tid === myId) continue; // skip self
        const exists = db
          .prepare(`SELECT id FROM users WHERE id = ?`).get(tid);
        if (!exists) continue;
        db.prepare(
          `INSERT OR IGNORE INTO shares (id, post_id, user_id, target_type, target_id, created_at)
           VALUES (?, ?, ?, 'friend', ?, ?)`
        ).run(cuid(), postId, myId, tid, Math.floor(Date.now() / 1000));

        // Notify the recipient (and the original post author if it's a different person).
        try {
          const me = db
            .prepare(`SELECT username, name FROM users WHERE id = ?`)
            .get(myId) as any;
          const actorName = me?.name || me?.username || "Ai đó";
          createNotification({
            recipientId: tid,
            actorId: myId,
            type: "share",
            title: `${actorName} đã chia sẻ một bài viết với bạn`,
            body: "Nhấn để xem chi tiết.",
            data: { postId, sharedBy: myId },
          });
          if (post?.user_id && post.user_id !== myId && post.user_id !== tid) {
            createNotification({
              recipientId: post.user_id,
              actorId: myId,
              type: "share",
              title: `${actorName} đã chia sẻ bài viết của bạn`,
              body: "Bài viết đang được lan truyền — xem ai đã nhận.",
              data: { postId, sharedWith: tid },
            });
          }
        } catch {
          // best-effort
        }
      }
    } else if (type === "group") {
      for (const tid of targets) {
        db.prepare(
          `INSERT OR IGNORE INTO shares (id, post_id, user_id, target_type, target_id, created_at)
           VALUES (?, ?, ?, 'group', ?, ?)`
        ).run(cuid(), postId, myId, tid, Math.floor(Date.now() / 1000));
      }
    }

    const total = (db
      .prepare(`SELECT COUNT(*) as c FROM shares WHERE post_id = ?`)
      .get(postId) as any).c as number;
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true, type, shared: targets.length, shareCount: total }, { headers: corsHeaders });
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
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: postId } = await params;
  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");

  try {
    const db = getDb();
    ensureTables(db);
    if (targetType && targetId) {
      db.prepare(
        `DELETE FROM shares WHERE post_id = ? AND user_id = ?
         AND target_type = ? AND target_id = ?`
      ).run(postId, myId, targetType, targetId);
    } else {
      db.prepare(
        `DELETE FROM shares WHERE post_id = ? AND user_id = ?`
      ).run(postId, myId);
    }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}