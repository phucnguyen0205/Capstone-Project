import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { corsHeaders } from "@/lib/cors";

/**
 * GET /api/posts/trending
 *
 * Surface the most-engaged image/text posts of the last 7 days for
 * the Discover page. Videos are intentionally excluded — they live
 * on the Reels tab. Group-scoped posts (`scope='group'`) are also
 * excluded so trending stays community-wide.
 *
 * Scoring:
 *   - like_count * 3
 *   - comment_count * 2
 *   - save_count   * 4
 *   - share_count  * 5
 *   - recency bonus: created within 24h gets a flat +20 nudge so a
 *     viral post doesn't get stuck at rank 2 just because it has 1
 *     less like than yesterday's leader.
 *
 * Visibility:
 *   - approved by moderation
 *   - not authored by the viewer
 *   - not in the viewer's `post_hides` list
 *   - public lens (lens='public') OR from a friend if lens='friends'
 *   - close lens: only if the viewer has enough closeness points
 *
 * Query params:
 *   limit  (default 20, max 50)
 *   offset (default 0)
 *   window (default "7d", only "7d" supported for v1)
 *
 * Response: { items: TrendingPost[] }
 */
export const dynamic = "force-dynamic";

interface TrendingRow {
  id: string;
  user_id: string;
  media_url: string | null;
  media_type: string | null;
  caption: string | null;
  lens: string;
  created_at: number;
  username: string;
  author_name: string | null;
  author_avatar: string | null;
  author_username: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  share_count: number;
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId = (session.user as any).id as string;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  try {
    const db = getDb();

    // 1. Friend set (for `lens='friends'` visibility)
    const friendRows = db
      .prepare(
        `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END AS fid
         FROM friendships
         WHERE status = 'accepted'
           AND (requester_id = ? OR receiver_id = ?)`,
      )
      .all(myId, myId, myId) as Array<{ fid: string }>;
    const friendSet = new Set(friendRows.map((r) => r.fid));

    // 2. Hidden posts
    const hiddenRows = db
      .prepare(`SELECT post_id FROM post_hides WHERE user_id = ?`)
      .all(myId) as Array<{ post_id: string }>;
    const hiddenIds = new Set(hiddenRows.map((r) => r.post_id));

    // 3. Pull candidate posts. We use a 7-day window and exclude
   // group-scoped ones (those live in the group page, not here).
    const SEVEN_DAYS_AGO = Math.floor(Date.now() / 1000) - 7 * 86400;
    const candidates = db
      .prepare(
        `SELECT p.id, p.user_id, p.media_url, p.media_type, p.caption,
                p.lens, p.created_at,
                u.username, u.name AS author_name, u.avatar AS author_avatar
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.scope = 'feed'
           AND p.media_type != 'video'
           AND p.moderation_status = 'approved'
           AND p.user_id != ?
           AND p.created_at >= ?
           AND (p.lens = 'public'
                OR (p.lens = 'friends' AND ? IN (
                     SELECT CASE WHEN requester_id = p.user_id THEN receiver_id ELSE requester_id END
                     FROM friendships
                     WHERE status = 'accepted'
                       AND (requester_id = ? OR receiver_id = ?)
                   ))
                   )`,
      )
      .all(
        myId,
        SEVEN_DAYS_AGO,
        myId,
        myId,
        myId,
      ) as Array<{
        id: string;
        user_id: string;
        media_url: string | null;
        media_type: string | null;
        caption: string | null;
        lens: string;
        created_at: number;
        username: string;
        author_name: string | null;
        author_avatar: string | null;
      }>;

    if (candidates.length === 0) {
      return NextResponse.json({ items: [] }, { headers: corsHeaders });
    }

    // 4. Fetch like, comment, save, share counts in bulk
    const ids = candidates.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");

    const likeRows = db
      .prepare(`SELECT post_id, COUNT(*) AS c FROM likes WHERE post_id IN (${placeholders}) GROUP BY post_id`)
      .all(...ids) as Array<{ post_id: string; c: number }>;
    const likeMap = new Map(likeRows.map((r) => [r.post_id, r.c]));

    const commentRows = db
      .prepare(
        `SELECT post_id, COUNT(*) AS c FROM comments
         WHERE post_id IN (${placeholders}) AND deleted_at IS NULL
         GROUP BY post_id`,
      )
      .all(...ids) as Array<{ post_id: string; c: number }>;
    const commentMap = new Map(commentRows.map((r) => [r.post_id, r.c]));

    const saveRows = db
      .prepare(`SELECT post_id, COUNT(*) AS c FROM saved_posts WHERE post_id IN (${placeholders}) GROUP BY post_id`)
      .all(...ids) as Array<{ post_id: string; c: number }>;
    const saveMap = new Map(saveRows.map((r) => [r.post_id, r.c]));

    const shareRows = db
      .prepare(`SELECT post_id, COUNT(*) AS c FROM post_shares WHERE post_id IN (${placeholders}) GROUP BY post_id`)
      .all(...ids) as Array<{ post_id: string; c: number }>;
    const shareMap = new Map(shareRows.map((r) => [r.post_id, r.c]));

    // 5. Score
    const now = Math.floor(Date.now() / 1000);
    const scored: TrendingRow[] = candidates
      .filter((c) => !hiddenIds.has(c.id))
      .map((c) => {
        const likes = likeMap.get(c.id) ?? 0;
        const comments = commentMap.get(c.id) ?? 0;
        const saves = saveMap.get(c.id) ?? 0;
        const shares = shareMap.get(c.id) ?? 0;
        // Recency nudge: anything posted in the last 24h gets a flat
        // +20 to nudge it past older leaders. Stops the leaderboard
        // from being permanently locked by yesterday's #1.
        const recencyBoost = c.created_at > now - 86400 ? 20 : 0;
        const score = likes * 3 + comments * 2 + saves * 4 + shares * 5 + recencyBoost;
        return {
          ...c,
          author_username: c.username,
          like_count: likes,
          comment_count: comments,
          save_count: saves,
          share_count: shares,
          // store score on a side-channel; we strip it before returning
          _score: score,
        } as TrendingRow & { _score: number };
      })
      .sort((a, b) => (b as any)._score - (a as any)._score);

    const items = scored.slice(offset, offset + limit).map(({ _score, username, ...row }: any) => {
      void _score;
      void username;
      return row;
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