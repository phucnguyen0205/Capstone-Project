import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { isPlayableVideoUrl } from "@/lib/cloudinary";
import {
  extractHashtags,
  scorePost,
  type RecommendationSignals,
} from "@/lib/recommend";
import {
  buildViewerContext,
  fetchLikersForPosts,
  fetchSaveCounts,
  fetchShareCounts,
} from "@/lib/recommend-db";

/**
 * GET /api/reels/explore
 *
 * Returns a ranked feed of video posts the viewer is allowed to watch
 * in the "Khám phá" reels surface. The list is composed server-side
 * from the existing `posts` table — there's no separate reels table.
 * Users do not post reels directly; instead, an algorithm curates
 * video posts from other accounts and surfaces them here.
 *
 * Algorithm (lightweight "for you" ranking):
 *   1. Pull the most recent N video posts that are approved by
 *      moderation and not authored by the viewer.
 *   2. Exclude anything the viewer has dismissed/hidden.
 *   3. Exclude `private` lens entirely (owner-only).
 *   4. Filter by visibility rules:
 *        - public:        everyone
 *        - friends:       accepted friendships only
 *        - close:         requires closeness points >= global threshold
 *                          OR the viewer has the unlock override for the
 *                          post (mirrors the photo gallery logic).
 *   5. Score each candidate by recency + light interaction signal
 *      (likes count) and return the top `limit` rows.
 *
 * Response:
 *   { items: ReelItem[] }
 *
 * Each item exposes everything the player needs to render:
 *   id, mediaUrl, mediaWidth, mediaHeight, caption, createdAt,
 *   lens, author: { id, username, name, avatar },
 *   likeCount, commentCount, likedByMe, distanceToUnlock (close only)
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

    // 1. Pull a wide recent window. We filter in memory so the SQL
    //    doesn't have to JOIN to friendships/closeness for every row.
    //
    //    Only `scope='feed'` posts surface in reels — group-only posts
    //    stay in their group and never become community reels.
    const WINDOW = 200;
    const candidates = db
      .prepare(
        // We surface only `moderation_status='approved'` videos from
        // other authors (those have cleared the AI moderation
        // pipeline). The viewer's OWN pending videos still appear
        // here so they can preview their upload while it waits in
        // the moderation queue.
        //
        // Wrapped in a subquery because SQLite (better-sqlite3)
        // doesn't accept ORDER BY column-aliases on top of a
        // bare UNION ALL — it requires the ORDER BY + LIMIT to
        // sit outside a SELECT.
        `SELECT * FROM (
           SELECT p.id, p.user_id, p.media_url, p.media_width, p.media_height,
                  p.caption, p.lens, p.created_at, p.moderation_status,
                  u.username, u.name AS author_name, u.avatar AS author_avatar
             FROM posts p
             JOIN users u ON u.id = p.user_id
            WHERE p.media_type = 'video'
              AND p.scope = 'feed'
              AND p.user_id != ?
              AND p.moderation_status = 'approved'
              AND p.lens != 'private'
              AND p.created_at >= ?
           UNION ALL
           -- Viewer's own pending videos (so they can preview them
           -- while moderation is still running).
           SELECT p.id, p.user_id, p.media_url, p.media_width, p.media_height,
                  p.caption, p.lens, p.created_at, p.moderation_status,
                  u.username, u.name AS author_name, u.avatar AS author_avatar
             FROM posts p
             JOIN users u ON u.id = p.user_id
            WHERE p.media_type = 'video'
              AND p.scope = 'feed'
              AND p.user_id = ?
              AND p.moderation_status = 'pending'
              AND p.lens != 'private'
              AND p.created_at >= ?
         ) AS combined
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(
        myId,
        Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60, // last 60 days
        myId,
        Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60,
        WINDOW,
      ) as Array<{
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

    // 2. Hidden/dismissed filter
    // (post_hides has no expires_at column — only a created_at; all rows
    // are permanent from the viewer's perspective.)
    const hiddenRows = db
      .prepare(`SELECT post_id FROM post_hides WHERE user_id = ?`)
      .all(myId) as Array<{ post_id: string }>;
    const hiddenIds = new Set(hiddenRows.map((r) => r.post_id));

    // 2b. Drop candidates whose media_url points at a Cloudinary
    // asset we know is unreliable (the `demo` cloud — see
    // scripts/seed-reels.js for the source of these stale URLs).
    // We do this BEFORE the visibility filter so the candidate
    // count never inflates with broken links.
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (!isPlayableVideoUrl(candidates[i].media_url)) {
        candidates.splice(i, 1);
      }
    }

    // 3. Accepted friend set + closeness (close lens)
    const friendRows = db
      .prepare(
        `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END AS friend_id
         FROM friendships
         WHERE status = 'accepted'
           AND (requester_id = ? OR receiver_id = ?)`,
      )
      .all(myId, myId, myId) as Array<{ friend_id: string }>;
    const friendSet = new Set(friendRows.map((r) => r.friend_id));

    const closenessRows = db
      .prepare(
        `SELECT pair_key, points FROM closeness`,
      )
      .all() as Array<{ pair_key: string; points: number }>;
    const closenessByKey = new Map(closenessRows.map((r) => [r.pair_key, r.points]));
    const getPairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const closenessBetween = (a: string, b: string) =>
      closenessByKey.get(getPairKey(a, b)) ?? 0;

    const settings = db
      .prepare(
        `SELECT video_unlock_points FROM mirror_settings WHERE id = 'global'`,
      )
      .get() as { video_unlock_points: number } | undefined;
    const videoUnlock = settings?.video_unlock_points ?? 60;

    // 4. Visibility filter
    type Reel = {
      id: string;
      mediaUrl: string;
      mediaWidth: number | null;
      mediaHeight: number | null;
      caption: string | null;
      createdAt: number;
      lens: string;
      locked: boolean;
      distanceToUnlock: number;
      // Points the viewer already has with the author. Only meaningful
      // for `lens='close'` reels; for other lenses we send 0. The UI
      // uses this to show "Bạn có X điểm thân thiết" on the lock card
      // so the user sees the gap closing instead of staring at a static
      // "chưa đủ điểm" message.
      myClosenessPoints: number;
      // Pending videos (mine only) get surfaced here so the author can
      // preview them. The UI overlays a small "Đang chờ duyệt" chip.
      moderationStatus: string;
      author: { id: string; username: string; name: string | null; avatar: string | null };
    };
    const visible: Reel[] = [];
    for (const row of candidates) {
      if (hiddenIds.has(row.id)) continue;
      if (row.lens === "public") {
        visible.push(shape(row, false, 0, 0, row.moderation_status));
        continue;
      }
      if (row.lens === "friends") {
        // Explore page: every approved friends-only video is surfaced
        // as a *locked* teaser even when the viewer isn't friends
        // with the author. Earlier revisions only added the row when
        // `friendSet.has(row.user_id)` was true — for a brand-new
        // user with zero accepted friends that meant the entire
        // friends-lens cohort was dropped silently and the feed
        // shrank to the public-only videos. Users with a small
        // friend graph reported "chỉ thấy 2 video tải lên" because
        // the missing reels weren't even in the locked deck. The
        // lock card already explains "Kết bạn để mở khoá" and the
        // existing ReelSlide renders the LockedReel component for
        // `locked=true`, so we just need to keep the row in the
        // list.
        if (friendSet.has(row.user_id)) {
          visible.push(shape(row, false, 0, 0, row.moderation_status));
        } else {
          visible.push(shape(row, true, videoUnlock, 0, row.moderation_status));
        }
        continue;
      }
      if (row.lens === "close") {
        if (!friendSet.has(row.user_id)) {
          // Not even friends — show as a locked teaser. The UI can
          // decide to render a "Cần kết bạn" gate.
          visible.push(shape(row, true, videoUnlock, 0, row.moderation_status));
          continue;
        }
        const points = closenessBetween(myId, row.user_id);
        const distance = Math.max(0, videoUnlock - points);
        if (points >= videoUnlock) {
          visible.push(shape(row, false, 0, points, row.moderation_status));
        } else {
          visible.push(shape(row, true, distance, points, row.moderation_status));
        }
        continue;
      }
    }

    // 5. Score: blend of recency (newer = better) and likeCount.
    const ids = visible.map((r) => r.id);
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
        const slot = likeMap.get(l.post_id) ?? { count: 0, mine: false };
        slot.count += 1;
        if (l.user_id === myId) slot.mine = true;
        likeMap.set(l.post_id, slot);
      }
    }

    const commentCountRows = ids.length
      ? (db
          .prepare(
            `SELECT post_id, COUNT(*) as c FROM comments
             WHERE post_id IN (${ids.map(() => "?").join(",")}) AND deleted_at IS NULL
             GROUP BY post_id`,
          )
          .all(...ids) as Array<{ post_id: string; c: number }>)
      : [];
    const commentCountMap = new Map(commentCountRows.map((r) => [r.post_id, r.c]));

    const now = Math.floor(Date.now() / 1000);

    // ── Recommendation rerank ─────────────────────────────────────────────
    // Same multi-signal scorer the home feed uses (recency, engagement,
    // velocity, author affinity, hashtag overlap, item collaborative)
    // but with one extra wrinkle: close-friends reels that the viewer
    // has already unlocked still rank naturally — we just pretend the
    // lock state doesn't exist when computing the score.
    const likers = fetchLikersForPosts(db, ids);
    const saveCounts = fetchSaveCounts(db, ids);
    const shareCounts = fetchShareCounts(db, ids);

    const viewerCtx = buildViewerContext(db, myId, now);
    let maxCollab = 0;
    for (const r of visible) {
      const likerIds = likers.get(r.id) ?? [];
      let s = 0;
      for (const uid of likerIds) s += viewerCtx.viewerSimilarity.get(uid) ?? 0;
      if (s > maxCollab) maxCollab = s;
    }

    const enriched = visible.map((r) => {
      const likes = likeMap.get(r.id) ?? { count: 0, mine: false };
      const sig: RecommendationSignals = {
        createdAt: r.createdAt,
        likeCount: likes.count,
        commentCount: commentCountMap.get(r.id) ?? 0,
        saveCount: saveCounts.get(r.id) ?? 0,
        shareCount: shareCounts.get(r.id) ?? 0,
        lens: (r.lens ?? "public") as RecommendationSignals["lens"],
        authorId: r.author.id,
        hashtags: extractHashtags(r.caption),
      };
      const breakdown = scorePost(
        sig,
        {
          ...viewerCtx,
          viewerLiked: likes.mine,
          viewerSaved: false,
          viewerHidden: false,
          authorDismissed: false,
        },
        { likerIds: likers.get(r.id) ?? [], maxInBatch: maxCollab },
      );
      // Track per-author counts for the diversity penalty on later
      // iterations.
      const prev = viewerCtx.seenAuthorCounts.get(r.author.id) ?? 0;
      viewerCtx.seenAuthorCounts.set(r.author.id, prev + 1);
      return {
        ...r,
        likeCount: likes.count,
        likedByMe: likes.mine,
        commentCount: commentCountMap.get(r.id) ?? 0,
        _score: breakdown.score,
        recReason: breakdown.reason ?? null,
      };
    });

    enriched.sort((a, b) => b._score - a._score);
    // User feedback: "chỉ thấy 2 video mới nhất" — the recommender
    // rerank was burying the bottom 2-3 reels in any batch where
    // the same author had uploaded twice (diversity penalty stacks
    // per-item: 0.55 for the 2nd post from the same author, 0.30
    // for the 3rd, etc.). For a small pool like ours (5 videos
    // total) that penalty overshoots and some reels never make it
    // into the visible top of the swipe deck. We keep the
    // `recReason` field for the UI tooltip but bypass the score
    // sort — the discover page should be "show me every reel"
    // not "show me what the algorithm picks". Recency is the new
    // primary key so the newest videos surface first.
    enriched.sort((a, b) => b.createdAt - a.createdAt);
    // Return every visible candidate. Earlier revisions capped the
    // response at 30/50 with `Math.min(50, parseInt(... ?? "30"))`,
    // which silently dropped reels from the Discover page when a
    // pool had more than 30 videos — users complained "chỉ thấy
    // 2 video" even though the DB had 5+. The window above is
    // already capped (WINDOW = 200) so the in-memory set is bounded
    // and there's no perf concern returning all of them.
    //
    // The `?limit=` param is still honoured so a future client
    // (e.g. a "Load more" button) can page through larger pools.
    const requested = new URL(req.url).searchParams.get("limit");
    const items =
      requested !== null
        ? enriched
            .slice(0, Math.min(parseInt(requested) || enriched.length, enriched.length))
            .map(({ _score, ...rest }) => rest)
        : enriched.map(({ _score, ...rest }) => rest);

    return NextResponse.json({ items }, { headers: corsHeaders });
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
    moderation_status: string;
  },
  locked: boolean,
  distanceToUnlock: number,
  myClosenessPoints: number,
  moderationStatus: string,
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
    moderationStatus,
    author: {
      id: row.user_id,
      username: row.username,
      name: row.author_name,
      avatar: row.author_avatar,
    },
  };
}
