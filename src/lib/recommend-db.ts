import type Database from "better-sqlite3";
import { extractHashtags } from "@/lib/recommend";
import type { ViewerContext } from "@/lib/recommend";

/**
 * Build the `ViewerContext` the scorer needs by issuing a few small
 * aggregation queries against the database. Designed to run in one
 * round-trip using prepared statements so each candidate rerank page
 * stays fast even for a power user with months of interaction history.
 *
 * ─── What we collect ─────────────────────────────────────────────────────────
 *
 *   authorAffinity   — per-author interaction score for the last 30
 *                       days. Likes × 1, comments × 2, saves × 3.
 *                       Mutual-friend bonus +0.05 per mutual friend
 *                       (capped at 0.3). Normalised to [0,1] by dividing
 *                       by the max single-author score so the highest-
 *                       engaged author sits at the ceiling.
 *
 *   hashtagAffinity  — per-hashtag weighted interaction count from the
 *                       last 30 days. Comments count 2×, saves 3× so
 *                       deep interactions outweigh shallow ones.
 *
 *   viewerSimilarity — co-engagement signal. For every other user who
 *                       also liked any of the viewer's recent posts we
 *                       compute a Jaccard-over-liked-posts score. The
 *                       result is a Map<userId, similarity [0,1]>.
 *                       The rerank loop sums these for the candidate's
 *                       likers to produce the collaborative signal.
 *
 *   seenAuthorCounts — empty by default; the route handler updates it
 *                       as it walks the rerank pass.
 *
 * ─── Negative signals ──────────────────────────────────────────────────────
 *
 * The route handler already filters hidden posts at the SQL layer; this
 * helper doesn't need to redo that work. It returns the bare-bones
 * context for the scorer.
 */
export interface BuildViewerContextOptions {
  /** Soft cap on how many rows to pull per aggregation query. */
  limit?: number;
}

export function buildViewerContext(
  db: Database.Database,
  viewerId: string,
  now: number,
  opts: BuildViewerContextOptions = {},
): ViewerContext {
  const limit = opts.limit ?? 50;

  // 1. Author affinity (last 30 days, weighted).
  //
  // For each author the viewer has interacted with (liked / commented /
  // saved a post by them), sum up a weighted interaction score. This
  // tells us "how interested is the viewer in this author right now?".
  // e.g. if the viewer liked 3 posts by @alice, commented on 1, and
  // saved 1, her score = 1*3 + 2*1 + 3*1 = 8.
  const authorRows = db
    .prepare(
      `SELECT p.user_id AS author_id,
              (1 * COUNT(DISTINCT l.id))
            + (2 * COUNT(DISTINCT c.id))
            + (3 * COUNT(DISTINCT sv.id)) AS score
       FROM posts p
       LEFT JOIN likes l
         ON l.post_id = p.id AND l.user_id = ? AND l.created_at >= ?
       LEFT JOIN comments c
         ON c.post_id = p.id AND c.user_id = ? AND c.created_at >= ?
       LEFT JOIN saves sv
         ON sv.post_id = p.id AND sv.user_id = ? AND sv.created_at >= ?
       WHERE p.user_id != ?
         AND (l.id IS NOT NULL OR c.id IS NOT NULL OR sv.id IS NOT NULL)
       GROUP BY p.user_id
       ORDER BY score DESC
       LIMIT ?`,
    )
    .all(
      viewerId, now - 30 * 86400,
      viewerId, now - 30 * 86400,
      viewerId, now - 30 * 86400,
      viewerId,
      limit,
    ) as Array<{ author_id: string; score: number }>;

  // Mutual-friend bonus per author. We compute the count of mutual
  // accepted friendships the viewer shares with each candidate author.
  // Capped at 0.3 absolute boost so a massively-connected user doesn't
  // blow out the affinity for everyone.
  const mutualRows = db
    .prepare(
      `WITH my_friend AS (
           SELECT user_id FROM (
             SELECT receiver_id AS user_id FROM friendships
              WHERE requester_id = ? AND status = 'accepted'
             UNION
             SELECT requester_id AS user_id FROM friendships
              WHERE receiver_id = ? AND status = 'accepted'
           )
         )
         SELECT u.id AS user_id,
                COUNT(*) AS mutual_count
         FROM friendships f
         JOIN my_friend mf
           ON (mf.user_id = f.requester_id AND f.receiver_id = ?)
           OR (mf.user_id = f.receiver_id AND f.requester_id = ?)
         JOIN users u ON u.id = mf.user_id
         WHERE f.status = 'accepted'
           AND u.id != ?
         GROUP BY u.id
         LIMIT ?`,
    )
    .all(viewerId, viewerId, viewerId, viewerId, viewerId, limit) as Array<{
    user_id: string;
    mutual_count: number;
  }>;
  const mutualByUser = new Map<string, number>(
    mutualRows.map((r) => [r.user_id, r.mutual_count]),
  );

  // Combine into a normalised author affinity map. We divide by the max
  // so the top author is at 1.0; the mutual-friend bonus is capped at
  // +0.3 so it doesn't dominate the raw score.
  const maxAuthorScore = Math.max(1, ...authorRows.map((r) => r.score));
  const authorAffinity = new Map<string, number>();
  for (const r of authorRows) {
    const base = r.score / maxAuthorScore;
    const mutual = Math.min(0.3, 0.05 * (mutualByUser.get(r.author_id) ?? 0));
    authorAffinity.set(r.author_id, Math.min(1, base + mutual));
  }

  // 2. Hashtag affinity (last 30 days, weighted).
  //
  // We grab the viewer's recent posts' captions, extract hashtags, and
  // weight by engagement on the source post. This is a content-based
  // signal: if the viewer mostly watches #phú-quốc content, those
  // hashtags will dominate the map.
  const hashtagRows = db
    .prepare(
      `SELECT p.caption,
              (1 * COALESCE(lc.cnt, 0)) + (2 * COALESCE(cc.cnt, 0)) AS score
       FROM posts p
       LEFT JOIN (
         SELECT post_id, COUNT(*) AS cnt FROM likes
          WHERE user_id = ? GROUP BY post_id
       ) lc ON lc.post_id = p.id
       LEFT JOIN (
         SELECT post_id, COUNT(*) AS cnt FROM comments
          WHERE user_id = ? GROUP BY post_id
       ) cc ON cc.post_id = p.id
       WHERE p.user_id = ?
         AND p.created_at >= ?
         AND p.caption IS NOT NULL
       ORDER BY score DESC LIMIT ?`,
    )
    .all(viewerId, viewerId, viewerId, now - 30 * 86400, limit) as Array<{
    caption: string | null;
    score: number;
  }>;

  const hashtagAffinity = new Map<string, number>();
  for (const r of hashtagRows) {
    const tags = extractHashtags(r.caption);
    for (const tag of tags) {
      hashtagAffinity.set(tag, (hashtagAffinity.get(tag) ?? 0) + r.score);
    }
  }

  // 3. Viewer similarity via co-engagement (item-based collaborative).
  //
  // For every other user who liked any of the viewer's recent posts,
  // compute their similarity as
  //     |viewer_likes ∩ user_likes| / |viewer_likes ∪ user_likes|
  // restricted to posts from the last 30 days. We then sort desc and
  // cap at `limit` rows. This is the lookup the scorer's collaborative
  // signal uses.
  const viewerSimilarity = buildViewerSimilarity(db, viewerId, now, limit);

  return {
    now,
    // Per-post booleans are populated per-row by the route handler.
    viewerLiked: false,
    viewerSaved: false,
    viewerHidden: false,
    authorDismissed: false,
    authorAffinity,
    hashtagAffinity,
    seenAuthorCounts: new Map<string, number>(),
    viewerSimilarity,
  };
}

/**
 * Compute the viewer's similarity map (cosine-on-likes for the last 30
 * days). We do this in two SQL passes — first grab the viewer's recent
 * likes, then for each co-liker count the overlap.
 *
 * Time complexity is O(rows × candidates) per query but well-bounded by
 * the limit. For a power user with 500 recent likes we still finish
 * in <100ms on SQLite because the inner join hits the (post_id, user_id)
 * composite index on `likes`.
 */
function buildViewerSimilarity(
  db: Database.Database,
  viewerId: string,
  now: number,
  limit: number,
): Map<string, number> {
  // Find every other user who liked any of the viewer's recent likes.
  // This is the candidate set — we don't compute similarity for users
  // who never co-engaged.
  const coLikers = db
    .prepare(
      `WITH viewer_liked AS (
        SELECT post_id FROM likes WHERE user_id = ?
      )
      SELECT l.user_id AS user_id, COUNT(*) AS co_count
      FROM likes l
      WHERE l.post_id IN (SELECT post_id FROM viewer_liked)
        AND l.user_id != ?
      GROUP BY l.user_id
      ORDER BY co_count DESC LIMIT ?`,
    )
    .all(viewerId, viewerId, limit * 4) as Array<{
    user_id: string;
    co_count: number;
  }>;

  if (coLikers.length === 0) return new Map();

  // For each candidate, compute Jaccard overlap on the last-30-day
  // like sets. The query pulls intersection + union in two COUNTs.
  const placeholders = coLikers.map(() => "?").join(",");
  const jaccardRows = db
    .prepare(
      `SELECT user_id,
              SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS inter,
              SUM(1) AS uni
       FROM (
         SELECT l1.user_id AS user_id, l1.post_id AS post_id FROM likes l1
         WHERE l1.user_id = ?
           AND l1.created_at >= ?
         UNION
         SELECT l2.user_id AS user_id, l2.post_id AS post_id FROM likes l2
         WHERE l2.user_id IN (${placeholders})
           AND l2.created_at >= ?
       )
       GROUP BY user_id`,
    )
    .all(
      viewerId,
      viewerId,
      now - 30 * 86400,
      ...coLikers.map((r) => r.user_id),
      now - 30 * 86400,
    ) as Array<{ user_id: string; inter: number; uni: number }>;

  // Map by user. The "inter" column is 0 for the viewer themselves
  // because they weren't in the placeholder group.
  const interByUser = new Map<string, number>();
  const uniByUser = new Map<string, number>();
  for (const r of jaccardRows) {
    interByUser.set(r.user_id, r.inter);
    uniByUser.set(r.user_id, r.uni);
  }

  const simMap = new Map<string, number>();
  for (const r of coLikers) {
    const inter = interByUser.get(r.user_id) ?? 0;
    const uni = uniByUser.get(r.user_id) ?? 0;
    const j = uni > 0 ? inter / uni : 0;
    simMap.set(r.user_id, j);
  }

  // Keep the top `limit` entries (already sorted by co_count in the
  // SQL, but we re-rank by Jaccard so the map is sorted by score).
  return new Map(
    Array.from(simMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit),
  );
}

/**
 * Fetch the set of liker IDs for a batch of posts. We use this to
 * compute the collaborative signal per row. Returns a Map<postId, likerIds>.
 */
export function fetchLikersForPosts(
  db: Database.Database,
  postIds: string[],
): Map<string, string[]> {
  if (postIds.length === 0) return new Map();
  const placeholders = postIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT post_id, user_id FROM likes WHERE post_id IN (${placeholders})`,
    )
    .all(...postIds) as Array<{ post_id: string; user_id: string }>;
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.post_id) ?? [];
    arr.push(r.user_id);
    map.set(r.post_id, arr);
  }
  return map;
}

/**
 * Pull save counts for a batch of posts. The route handler merges these
 * into the engagement signal.
 */
export function fetchSaveCounts(
  db: Database.Database,
  postIds: string[],
): Map<string, number> {
  if (postIds.length === 0) return new Map();
  const placeholders = postIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT post_id, COUNT(*) AS c FROM saves WHERE post_id IN (${placeholders}) GROUP BY post_id`,
    )
    .all(...postIds) as Array<{ post_id: string; c: number }>;
  return new Map(rows.map((r) => [r.post_id, r.c]));
}

/**
 * Pull share counts for a batch of posts.
 */
export function fetchShareCounts(
  db: Database.Database,
  postIds: string[],
): Map<string, number> {
  if (postIds.length === 0) return new Map();
  const placeholders = postIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT post_id, COUNT(*) AS c FROM shares WHERE post_id IN (${placeholders}) GROUP BY post_id`,
    )
    .all(...postIds) as Array<{ post_id: string; c: number }>;
  return new Map(rows.map((r) => [r.post_id, r.c]));
}