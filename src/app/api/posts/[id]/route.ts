import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * PATCH  /api/posts/[id]
 *   Edit a post (caption or lens) — only the author can edit.
 *   Body: { caption?: string, lens?: "public"|"friends"|"close" }
 *
 * DELETE /api/posts/[id]
 *   Delete a post — only the author can delete.
 *   Cascade: removes likes, comments, saves for the post.
 */

const VALID_LENS = new Set(["public", "friends", "close"]);


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;
  const { id: postId } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      caption?: string;
      lens?: string;
    };

    const db = getDb();
    const post = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }
    if (post.user_id !== myId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không có quyền sửa bài này" }, { status: 403 }, { headers: corsHeaders });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof body.caption === "string") {
      const trimmed = body.caption.trim();
      if (trimmed.length > 2000) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json(
          { error: "Caption tối đa 2000 ký tự" },
          { status: 400 }
        , { headers: corsHeaders });
      }
      updates.push("caption = ?");
      values.push(trimmed);
    }

    if (typeof body.lens === "string") {
      if (!VALID_LENS.has(body.lens)) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json(
          { error: "Lens không hợp lệ (public/friends/close)" },
          { status: 400, headers: corsHeaders }
        );
      }
      updates.push("lens = ?");
      values.push(body.lens);
    }

    if (updates.length === 0) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không có gì để cập nhật" }, { status: 400 }, { headers: corsHeaders });
    }

    values.push(postId);
    db.prepare(`UPDATE posts SET ${updates.join(", ")} WHERE id = ?`).run(...values);
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
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;
  const { id: postId } = await params;

  try {
    const db = getDb();
    const post = db.prepare(`SELECT user_id FROM posts WHERE id = ?`).get(postId) as any;
    if (!post) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy bài viết" }, { status: 404 }, { headers: corsHeaders });
    }
    if (post.user_id !== myId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không có quyền xoá bài này" }, { status: 403 }, { headers: corsHeaders });
    }

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM likes WHERE post_id = ?`).run(postId);
      db.prepare(`DELETE FROM comments WHERE post_id = ?`).run(postId);
      db.prepare(`DELETE FROM saves WHERE post_id = ?`).run(postId);
      // Drop any notifications referencing this post (likes, comments,
      // shares, mentions) so they don't linger in anyone's bell after
      // the post is gone.
      db.prepare(
        `DELETE FROM notifications
         WHERE type IN ('like', 'comment', 'share', 'mention')
           AND data LIKE ?`
      ).run(`%"postId":"${postId}"%`);
      db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
    });
    tx();
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function GET(
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
    const db = getDb();
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

    const row = db
      .prepare(
        `SELECT p.*, u.username, u.name as author_name, u.avatar as author_avatar
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.id = ?`
      )
      .get(postId) as any;
    if (!row) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 }, { headers: corsHeaders });
    }

    const likes = (db
      .prepare(`SELECT COUNT(*) as c FROM likes WHERE post_id = ?`)
      .get(postId) as any).c as number;
    const comments = (db
      .prepare(`SELECT COUNT(*) as c FROM comments WHERE post_id = ?`)
      .get(postId) as any).c as number;
    const liked = !!db.prepare(`SELECT id FROM likes WHERE user_id = ? AND post_id = ?`).get(myId, postId);
    const saved = !!db.prepare(`SELECT id FROM saves WHERE user_id = ? AND post_id = ?`).get(myId, postId);
    const shareCount = (db
      .prepare(`SELECT COUNT(*) as c FROM shares WHERE post_id = ?`)
      .get(postId) as any).c as number;
    const sharedByMe = !!db.prepare(`SELECT id FROM shares WHERE post_id = ? AND user_id = ?`).get(postId, myId);

    const hiddenFromUsers = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar
         FROM post_hides h
         JOIN users u ON u.id = h.target_user_id
         WHERE h.post_id = ? AND h.user_id = ? AND h.scope = 'users'`
      )
      .all(postId, myId) as any[];

    const hiddenFromFeed = !!db
      .prepare(`SELECT id FROM post_hides WHERE post_id = ? AND user_id = ? AND scope = 'feed' LIMIT 1`)
      .get(postId, myId);

    // Relationship: does viewer follow author? does author follow viewer?
    const iFollowThem = !!db
      .prepare(`SELECT id FROM friendships WHERE requester_id = ? AND receiver_id = ? AND status = 'accepted' LIMIT 1`)
      .get(myId, row.user_id);
    const theyFollowMe = !!db
      .prepare(`SELECT id FROM friendships WHERE requester_id = ? AND receiver_id = ? AND status = 'accepted' LIMIT 1`)
      .get(row.user_id, myId);

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    // Transform Cloudinary URLs for browser compatibility (heic→webp, mov→mp4)
    let mediaUrl = row.media_url;
    if (mediaUrl && typeof mediaUrl === "string") {
      const match = mediaUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.+)$/);
      if (match) {
        const basePath = match[1];
        const tail = match[3];
        mediaUrl = `${basePath}f_auto,q_auto/${tail}`;
      }
    }

    return NextResponse.json({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      authorName: row.author_name,
      authorAvatar: row.author_avatar,
      caption: row.caption,
      mediaUrl,
      mediaType: row.media_type,
      publicId: row.public_id,
      lens: row.lens,
      createdAt: row.created_at,
      likes,
      comments,
      liked,
      saved,
      shareCount,
      sharedByMe,
      hiddenFromUsers: hiddenFromUsers.map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        avatar: u.avatar,
      })),
      hiddenFromFeed,
      iFollowThem,
      theyFollowMe,
      isOwn: row.user_id === myId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}