import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups/feed
 *
 * Returns the group feed for the current user. The "group" in this app is
 * the set of people the viewer has an accepted friendship with, so the feed
 * shows posts authored by accepted friends OR by the viewer themselves.
 *
 * Query params:
 *   - lens    : "all" | "public" | "friends" | "close" — filter by post lens
 *   - limit   : max 50 (default 30)
 *   - offset  : pagination (default 0)
 *
 * Visibility rules (apply per row):
 *   - own posts → always visible
 *   - friend's posts → visible if lens != "private" AND author is an
 *     accepted friend of the viewer. We currently treat "close" lens as
 *     visible to accepted friends.
 *   - posts with lens "private" → visible only to the author themselves
 *
 * Response: array of post objects enriched with author + counters.
 */
export const dynamic = "force-dynamic";

const VISIBLE_LENS = new Set(["public", "friends", "close"]);

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const lens = (searchParams.get("lens") ?? "all").toLowerCase();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  try {
    const db = getDb();

    // Build WHERE clause for lens filter
    let lensWhere = "";
    const params: unknown[] = [];
    if (lens !== "all" && VISIBLE_LENS.has(lens)) {
      lensWhere = ` AND p.lens = ?`;
      params.push(lens);
    }

    // Posts where author is me OR an accepted friend, AND visibility allows.
    // We OR author_id = myId separately so we don't need a JOIN for that case.
    const rows = db
      .prepare(
        `SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type, p.lens, p.created_at,
                u.username as author_username, u.name as author_name, u.avatar as author_avatar,
                u.is_online, u.last_active_at
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE (
           p.user_id = ?
           OR EXISTS (
             SELECT 1 FROM friendships f
             WHERE f.status = 'accepted'
               AND ((f.requester_id = ? AND f.receiver_id = p.user_id)
                    OR (f.requester_id = p.user_id AND f.receiver_id = ?))
           )
         )
         AND (p.user_id = ? OR p.lens IN ('public','friends','close'))
         ${lensWhere}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(myId, myId, myId, myId, ...params, limit, offset) as any[];

    // Enrich with like/comment counts in one query
    const postIds = rows.map((r) => r.id);
    const counts: Record<string, { likes: number; comments: number }> = {};
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => "?").join(",");
      const likeRows = db
        .prepare(
          `SELECT post_id, COUNT(*) as c FROM likes WHERE post_id IN (${placeholders}) GROUP BY post_id`
        )
        .all(...postIds) as any[];
      const commentRows = db
        .prepare(
          `SELECT post_id, COUNT(*) as c FROM comments WHERE post_id IN (${placeholders}) GROUP BY post_id`
        )
        .all(...postIds) as any[];
      for (const r of rows) counts[r.id] = { likes: 0, comments: 0 };
      for (const r of likeRows) {
        if (counts[r.post_id]) counts[r.post_id].likes = r.c;
      }
      for (const r of commentRows) {
        if (counts[r.post_id]) counts[r.post_id].comments = r.c;
      }
    }

    // Also detect which posts the viewer has liked (for heart icon state)
    let myLikes: Set<string> = new Set();
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => "?").join(",");
      const likedRows = db
        .prepare(
          `SELECT post_id FROM likes WHERE user_id = ? AND post_id IN (${placeholders})`
        )
        .all(myId, ...postIds) as any[];
      myLikes = new Set(likedRows.map((r) => r.post_id));
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const now = Math.floor(Date.now() / 1000);
    const data = rows.map((r) => {
      const lastActive = r.last_active_at ?? 0;
      const isOnline = r.is_online ?? 0;
      const delta = Math.max(0, now - lastActive);
      const effectivelyOnline = !!isOnline && delta < 5 * 60;
      
      // Transform Cloudinary URLs to web-friendly formats. We only inject
// transforms for IMAGES — videos already come through with the right
// codec from the upload step, and re-injecting `f_auto` here can cause
// Cloudinary to return a `.heic` payload (browser can't decode, video
// element retries → "video load lâu"). See commit message for context.
      const isVideo = (r.media_type ?? "").startsWith("video");
      let transformedUrl = r.media_url;
      if (r.media_url && !isVideo) {
        const match = r.media_url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.+)$/);
        if (match) {
          const basePath = match[1];
          const tail = match[3];
          transformedUrl = `${basePath}f_auto,q_auto/${tail}`;
        }
      }
      
      return {
        id: r.id,
        userId: r.user_id,
        author: {
          id: r.user_id,
          username: r.author_username,
          name: r.author_name,
          avatar: r.author_avatar,
          isOnline: effectivelyOnline,
        },
        caption: r.caption,
        mediaUrl: transformedUrl,
        mediaType: r.media_type,
        lens: r.lens,
        createdAt: r.created_at,
        likes: counts[r.id]?.likes ?? 0,
        comments: counts[r.id]?.comments ?? 0,
        liked: myLikes.has(r.id),
      };
    });

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}