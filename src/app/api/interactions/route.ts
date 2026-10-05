import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { createNotification } from "@/lib/notifications";
import { bumpCloseness } from "@/lib/closeness.server";

// Ensure tables exist
function ensureTables(sqlite: ReturnType<typeof getDb>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS saves (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

function cuid() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

/**
 * After a like or comment, recompute the closeness between the viewer and
 * the post's author. Silent on failure so the main action always succeeds.
 */
function bumpClosenessWithAuthor(
  db: ReturnType<typeof getDb>,
  viewerId: string,
  authorId: string,
) {
  if (!authorId || authorId === viewerId) return;
  try {
    bumpCloseness(db, viewerId, authorId);
  } catch {
    /* best-effort */
  }
}


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const userId = (session.user as any).id;

  try {
    const body = await request.json();
    const { action, postId, content } = body;

    if (!action || !postId) {
      return NextResponse.json({ error: "Thiếu action hoặc postId" }, { status: 400 }, { headers: corsHeaders });
    }

    const db = getDb();
    ensureTables(db);

    if (action === "like") {
      const existing = db.prepare("SELECT id FROM likes WHERE user_id = ? AND post_id = ?").get(userId, postId);
      if (existing) {
        db.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").run(userId, postId);
        // Drop the bell notification the author got when I liked the post
        // so the badge reflects the new state on next poll.
        try {
          const post = db
            .prepare(`SELECT user_id FROM posts WHERE id = ?`)
            .get(postId) as any;
          if (post?.user_id && post.user_id !== userId) {
            db.prepare(
              `DELETE FROM notifications
               WHERE type = 'like'
                 AND recipient_id = ?
                 AND actor_id = ?
                 AND data LIKE ?`
            ).run(post.user_id, userId, `%"postId":"${postId}"%`);
            // Closeness drops back when a like is removed.
            bumpClosenessWithAuthor(db, userId, post.user_id);
          }
        } catch {
          // best-effort
        }
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ liked: false }, { headers: corsHeaders });
      } else {
        db.prepare("INSERT OR IGNORE INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)").run(cuid(), userId, postId, Math.floor(Date.now() / 1000));

        // Notify the post author about the like (skip self-likes).
        try {
          const post = db
            .prepare(`SELECT user_id FROM posts WHERE id = ?`)
            .get(postId) as any;
          const me = db
            .prepare(`SELECT username, name FROM users WHERE id = ?`)
            .get(userId) as any;
          if (post?.user_id && post.user_id !== userId) {
            const actorName = me?.name || me?.username || "Ai đó";
            createNotification({
              recipientId: post.user_id,
              actorId: userId,
              type: "like",
              title: `${actorName} đã thích bài viết của bạn`,
              data: { postId },
            });
            // Bump closeness — reciprocated likes feed the streak.
            bumpClosenessWithAuthor(db, userId, post.user_id);
          }
        } catch {
          // best-effort
        }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ liked: true }, { headers: corsHeaders });
      }
    }

    if (action === "save") {
      const existing = db.prepare("SELECT id FROM saves WHERE user_id = ? AND post_id = ?").get(userId, postId);
      if (existing) {
        db.prepare("DELETE FROM saves WHERE user_id = ? AND post_id = ?").run(userId, postId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ saved: false }, { headers: corsHeaders });
      } else {
        db.prepare("INSERT OR IGNORE INTO saves (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)").run(cuid(), userId, postId, Math.floor(Date.now() / 1000));
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ saved: true }, { headers: corsHeaders });
      }
    }

    if (action === "comment") {
      if (!content?.trim()) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        return NextResponse.json({ error: "Nội dung bình luận trống" }, { status: 400 }, { headers: corsHeaders });
      }
      const id = cuid();
      db.prepare("INSERT INTO comments (id, user_id, post_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, postId, content.trim(), Math.floor(Date.now() / 1000));
      const comment = db.prepare("SELECT c.*, u.username, u.name as author_name FROM comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?").get(id);

      // Notify the post author.
      try {
        const post = db
          .prepare(`SELECT user_id FROM posts WHERE id = ?`)
          .get(postId) as any;
        if (post?.user_id && post.user_id !== userId) {
          const me = db
            .prepare(`SELECT username, name FROM users WHERE id = ?`)
            .get(userId) as any;
          const actorName = me?.name || me?.username || "Ai đó";
          const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
          createNotification({
            recipientId: post.user_id,
            actorId: userId,
            type: "comment",
            title: `${actorName} đã bình luận về bài viết của bạn`,
            body: preview,
            data: { postId, commentId: id },
          });
          // Comments count double in the activity ratio.
          bumpClosenessWithAuthor(db, userId, post.user_id);
        }
      } catch {
        // best-effort
      }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json(comment, { status: 201 }, { headers: corsHeaders });
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const myId = session ? (session.user as any).id : null;

  try {
    const url = new URL(request.url);
    const postId = url.searchParams.get("postId");

    const db = getDb();
    ensureTables(db);

    if (!postId) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Thiếu postId" }, { status: 400 }, { headers: corsHeaders });
    }

    const likes = db.prepare("SELECT COUNT(*) as count FROM likes WHERE post_id = ?").get(postId) as any;
    const comments = db.prepare(`
      SELECT c.*, u.username, u.name as author_name
      FROM comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.post_id = ?
      ORDER BY c.created_at DESC
      LIMIT 50
    `).all(postId);

    let liked = false, saved = false;
    if (myId) {
      liked = !!db.prepare("SELECT id FROM likes WHERE user_id = ? AND post_id = ?").get(myId, postId);
      saved = !!db.prepare("SELECT id FROM saves WHERE user_id = ? AND post_id = ?").get(myId, postId);
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ likes: likes.count, liked, saved, comments }, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
