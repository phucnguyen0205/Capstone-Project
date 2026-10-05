import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { isPlayableVideoUrl } from "@/lib/cloudinary";

/**
 * GET /api/reels/mine
 *
 * Returns the viewer's own video posts in reverse chronological
 * order. This is the "Thư viện của bạn" surface — separate from
 * /api/reels/explore because the audience is the user themselves
 * and we never need a ranking algorithm here.
 *
 * Response:
 *   { items: ReelItem[] }
 *
 * Items include like/comment counts so the library can show
 * engagement per video without a second round-trip.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as {
    user?: { id: string };
  } | null;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId: string = session.user.id;

  try {
    const db = getDb();
    const rows = db
      .prepare(
        // The library surfaces everything the viewer has uploaded,
        // regardless of moderation status. Pending uploads still show
        // up so the user can preview their work while it waits in the
        // AI moderation queue; we tag each row with `moderationStatus`
        // so the UI can render a "Đang chờ duyệt" chip.
        `SELECT p.id, p.user_id, p.media_url, p.media_width, p.media_height,
                p.caption, p.lens, p.created_at, p.moderation_status,
                u.username, u.name as author_name, u.avatar as author_avatar
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.media_type = 'video'
           AND p.scope = 'feed'
           AND p.user_id = ?
           AND p.moderation_status IN ('approved', 'pending')
         ORDER BY p.created_at DESC
         LIMIT 200`,
      )
      .all(myId) as Array<{
        id: string;
        user_id: string;
        media_url: string;
        media_width: number | null;
        media_height: number | null;
        caption: string | null;
        lens: string;
        created_at: number;
        moderation_status: string;
        username: string;
        author_name: string | null;
        author_avatar: string | null;
      }>;

    // Drop stale `demo` cloud URLs (see scripts/seed-reels.js for the
    // origin of these placeholder assets). User-uploaded videos
    // always live on the project's own Cloudinary cloud, so this
    // filter only removes dead-link seeded rows.
    const playableRows = rows.filter((r) => isPlayableVideoUrl(r.media_url));

    const ids = playableRows.map((r) => r.id);
    const likeMap = new Map<string, { count: number; mine: boolean }>();
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      const likeRows = db
        .prepare(
          `SELECT post_id, user_id FROM likes
           WHERE post_id IN (${placeholders})`,
        )
        .all(...ids) as Array<{ post_id: string; user_id: string }>;
      for (const l of likeRows) {
        const slot = likeMap.get(l.post_id) ?? { count: 0, mine: true };
        slot.count += 1;
        likeMap.set(l.post_id, slot);
      }
    }
    const commentRows = ids.length
      ? (db
          .prepare(
            `SELECT post_id, COUNT(*) as c FROM comments
             WHERE post_id IN (${ids.map(() => "?").join(",")}) AND deleted_at IS NULL
             GROUP BY post_id`,
          )
          .all(...ids) as Array<{ post_id: string; c: number }>)
      : [];
    const commentCountMap = new Map(commentRows.map((r) => [r.post_id, r.c]));

    const items = playableRows.map((row) => {
      const likes = likeMap.get(row.id) ?? { count: 0, mine: true };
      return {
        id: row.id,
        mediaUrl: row.media_url,
        mediaWidth: row.media_width,
        mediaHeight: row.media_height,
        caption: row.caption,
        createdAt: row.created_at,
        lens: row.lens,
        // Owner view — never locked, never needs a distance display.
        locked: false,
        distanceToUnlock: 0,
        myClosenessPoints: 0,
        // Mirror the moderation status so the UI can render a chip
        // like "Đang chờ duyệt" on pending uploads.
        moderationStatus: row.moderation_status,
        author: {
          id: row.user_id,
          username: row.username,
          name: row.author_name,
          avatar: row.author_avatar,
        },
        likeCount: likes.count,
        likedByMe: likes.mine,
        commentCount: commentCountMap.get(row.id) ?? 0,
      };
    });

    return NextResponse.json({ items }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
