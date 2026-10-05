import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/reels/[id]/unlock
 *
 * Returns the media URL for a close-friends reel if (and only if) the
 * viewer has met the closeness-points threshold with the author. The
 * `mediaUrl` is intentionally omitted from the explore feed when a
 * reel is locked, so the only legitimate way to fetch it is via this
 * endpoint after the threshold has been reached.
 *
 * Response:
 *   200 — { id, mediaUrl, mediaWidth, mediaHeight, caption, createdAt, lens,
 *           author: {…}, likeCount, commentCount, likedByMe }
 *   403 — { error } if not yet allowed (insufficient points, not friends,
 *           lens not 'close', post not approved, etc.)
 *   404 — { error } if the post doesn't exist or has been moderated away
 *
 * The body keeps the same shape as a regular reel so the player can
 * splice the unlocked item into its in-memory list and the rest of
 * the UI (likes, comments, share) keeps working without a refetch.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

function getPairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  const { id: postId } = await params;

  try {
    const db = getDb();

    // 1. Load the post + author. Approval + scope filters block
    //    tampered or removed reels.
    const row = db
      .prepare(
        `SELECT p.id, p.user_id, p.media_url, p.media_width, p.media_height,
                p.caption, p.lens, p.created_at, p.moderation_status, p.scope,
                u.username, u.name as author_name, u.avatar as author_avatar
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.id = ? LIMIT 1`,
      )
      .get(postId) as
      | {
          id: string;
          user_id: string;
          media_url: string;
          media_width: number | null;
          media_height: number | null;
          caption: string | null;
          lens: string;
          created_at: number;
          moderation_status: string;
          scope: string;
          username: string;
          author_name: string | null;
          author_avatar: string | null;
        }
      | undefined;
    if (!row || row.moderation_status !== "approved" || row.scope !== "feed") {
      return NextResponse.json(
        { error: "Bài đăng không khả dụng" },
        { status: 404, headers: corsHeaders },
      );
    }

    // 2. Public reels are always unlocked.
    if (row.lens === "public") {
      return NextResponse.json(
        { ok: true, reel: shape(row, false, 0, 0) },
        { headers: corsHeaders },
      );
    }

    // 3. Friends lens: only if accepted friendship exists.
    if (row.lens === "friends") {
      const isFriend = db
        .prepare(
          `SELECT 1 FROM friendships
           WHERE status = 'accepted'
             AND ((requester_id = ? AND receiver_id = ?)
                  OR (requester_id = ? AND receiver_id = ?))
           LIMIT 1`,
        )
        .get(myId, row.user_id, row.user_id, myId);
      if (!isFriend) {
        return NextResponse.json(
          { error: "Bạn cần kết bạn với tác giả để xem video này" },
          { status: 403, headers: corsHeaders },
        );
      }
      return NextResponse.json(
        { ok: true, reel: shape(row, false, 0, 0) },
        { headers: corsHeaders },
      );
    }

    // 4. Close lens: require friendship + closeness points threshold.
    if (row.lens === "close") {
      const isFriend = db
        .prepare(
          `SELECT 1 FROM friendships
           WHERE status = 'accepted'
             AND ((requester_id = ? AND receiver_id = ?)
                  OR (requester_id = ? AND receiver_id = ?))
           LIMIT 1`,
        )
        .get(myId, row.user_id, row.user_id, myId);
      if (!isFriend) {
        return NextResponse.json(
          { error: "Bạn cần kết bạn với tác giả để xem video này" },
          { status: 403, headers: corsHeaders },
        );
      }

      const settings = db
        .prepare(
          `SELECT video_unlock_points FROM mirror_settings WHERE id = 'global'`,
        )
        .get() as { video_unlock_points: number } | undefined;
      const threshold = settings?.video_unlock_points ?? 60;

      const closeness = db
        .prepare(
          `SELECT points FROM closeness WHERE pair_key = ? LIMIT 1`,
        )
        .get(getPairKey(myId, row.user_id)) as { points: number } | undefined;
      const points = closeness?.points ?? 0;
      if (points < threshold) {
        return NextResponse.json(
          {
            error: "Bạn chưa đủ điểm thân thiết để mở khoá",
            myClosenessPoints: points,
            requiredPoints: threshold,
            distance: threshold - points,
          },
          { status: 403, headers: corsHeaders },
        );
      }
      return NextResponse.json(
        { ok: true, reel: shape(row, false, 0, points) },
        { headers: corsHeaders },
      );
    }

    // 5. private / unknown lens
    return NextResponse.json(
      { error: "Bài đăng không khả dụng" },
      { status: 404, headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}

function shape(
  row: {
    id: string;
    user_id: string;
    media_url: string;
    media_width: number | null;
    media_height: number | null;
    caption: string | null;
    lens: string;
    created_at: number;
    username: string;
    author_name: string | null;
    author_avatar: string | null;
  },
  locked: boolean,
  distanceToUnlock: number,
  myClosenessPoints: number,
) {
  return {
    id: row.id,
    mediaUrl: row.media_url,
    mediaWidth: row.media_width,
    mediaHeight: row.media_height,
    caption: row.caption,
    createdAt: row.created_at,
    lens: row.lens,
    locked,
    distanceToUnlock,
    myClosenessPoints,
    author: {
      id: row.user_id,
      username: row.username,
      name: row.author_name,
      avatar: row.author_avatar,
    },
  };
}