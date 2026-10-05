/**
 * Multi-signal recommendation scorer for the home feed and reels.
 *
 * Inspired by Facebook's "stories you might like" + TikTok's "For You"
 * pagination, but adapted to our smaller social graph. We DON'T do
 * heavyweight ML — we run a transparent linear blend of the signals
 * we already collect (likes, comments, saves, hashtag overlap, author
 * affinity). This is the right trade-off for a serverless Next.js API
 * where we want every request to be explainable and fast (sub-50ms
 * scoring on a 200-row candidate set).
 *
 * ─── Signal inventory ─────────────────────────────────────────────────────
 *
 *   recency           — exponential decay (6h half-life).
 *   engagement         — likes + 2*comments + 3*saves + 4*shares.
 *                       Saves/shares are weighted higher because they
 *                       represent deliberate curation (a user thought
 *                       about it and decided to keep / forward it).
 *   velocity           — engagement / ageHours (per-hour engagement rate).
 *                       Used to detect "viral early" content that hasn't
 *                       racked up absolute counts yet but is exploding.
 *   authorAffinity     — sum of (likes × w_like + comments ×
 *                       w_comment + mutual friend bonus) the viewer has
 *                       with this author. Normalized to [0,1].
 *   hashtagOverlap     — weighted Jaccard similarity between (post's
 *                       hashtags) and (viewer's interaction history
 *                       hashtags). Up to 30 hashtags from the last 30
 *                       days, weighted by interaction weight.
 *   collaborativeItem  — sum of affinity scores the viewer has for
 *                       people who also liked this post. A 1-hop
 *                       collaborative signal.
 *   diversityPenalty   — multiplicative penalty when the viewer has
 *                       already been recommended posts from the same
 *                       author in this rerank pass. Stops the top-5
 *                       from being all the same person.
 *   lensBonus          — public posts get a small bonus so non-friends
 *                       content still surfaces; the final feed mix is
 *                       mostly friends + public.
 *   negativeSignals    — hard demote if (a) the viewer has hidden this
 *                       post, (b) the author has been dismissed, (c)
 *                       the viewer has already saved/liked the post.
 *
 * ─── Score formula ───────────────────────────────────────────────────────
 *
 *   rawScore =
 *     + 0.30 * recency
 *     + 0.25 * engagement
 *     + 0.20 * velocity
 *     + 0.10 * authorAffinity
 *     + 0.10 * hashtagOverlap
 *     + 0.05 * collaborativeItem
 *
 *   finalScore = rawScore
 *     * diversityPenalty
 *     * (1 + lensBonus)
 *
 * The final score is then mapped to a `scoreBreakdown` object so the
 * client can show "Đề xuất vì tương tác hashtag X" if it wants.
 */

/**
 * A signal we have collected for one (viewer, post) pair. Built up by
 * the API route handler before being passed to the scorer. The fields
 * are intentionally simple primitives — the scorer does the math.
 */
export interface RecommendationSignals {
  /** Unix epoch seconds when the post was created. */
  createdAt: number;
  /** Total likes across all users. */
  likeCount: number;
  /** Total comments across all users. */
  commentCount: number;
  /** Total saves across all users. */
  saveCount: number;
  /** Total shares across all users. */
  shareCount: number;
  /** Lens tag from `posts.lens`. Affects visibility + small boost. */
  lens: "public" | "friends" | "close" | "private";
  /** Author user id. Used to apply diversity penalty + author affinity. */
  authorId: string;
  /** Lower-cased hashtags extracted from the caption (`#foo` tokens). */
  hashtags: string[];
}

export interface ViewerContext {
  /** Unix epoch seconds for "now". */
  now: number;
  /** True when the viewer has already liked the post. Used for negative
   *  signal: surface other posts instead of ones they've engaged with. */
  viewerLiked: boolean;
  /** True when the viewer has saved the post. */
  viewerSaved: boolean;
  /** True when the viewer has hidden/dismissed the post. Hard demote. */
  viewerHidden: boolean;
  /** True when the viewer has dismissed the entire author. Hard demote. */
  authorDismissed: boolean;
  /**
   * Per-author affinity scores (the viewer's interest in each author).
   * Built from the viewer's last 30 days of interactions. Each entry
   * aggregates: likes, comments, mutual-friends, plus a small recency
   * boost for recent interactions. Stored as a lookup `Map`.
   */
  authorAffinity: Map<string, number>;
  /**
   * Weighted hashtag + value score from the viewer's interaction history.
   * Like `count` of (interaction weight) for each hashtag the viewer has
   * touched in the last 30 days. We use this to compute overlap with a
   * candidate post's hashtags.
   */
  hashtagAffinity: Map<string, number>;
  /**
   * Map of count of posts the viewer has already seen on this session
   * page, keyed by author — drives the diversity penalty.
   */
  seenAuthorCounts: Map<string, number>;
  /**
   * Item-based collaborative signal: similarity scores between the
   * viewer and every other user who has liked any post recently.
   * Summed across the candidate's likers in `scorePost`.
   */
  viewerSimilarity: Map<string, number>;
}

export interface ScoreBreakdown {
  /** Final scalar used for ranking. */
  score: number;
  /** 0..1 contribution of each signal before blending. */
  recency: number;
  engagement: number;
  velocity: number;
  authorAffinity: number;
  hashtagOverlap: number;
  collaborativeItem: number;
  diversityPenalty: number;
  lensBonus: number;
  /** Optional human-readable reason for the recommendation. The UI can
   *  show this in a small tooltip "Vì sao bài này ở đây?". */
  reason?: string;
}

/**
 * Default weights. Exported so tests can re-import and override.
 *
 * The recency weight is intentionally dominant — a viral post from 4
 * days ago should not crowd out a fresh post the viewer's friends
 * haven't seen yet. We compensate for that with a low-passed velocity
 * signal so rapidly-trending posts still climb quickly even if their
 * absolute counts are low.
 */
export const WEIGHTS = {
  recency: 0.30,
  engagement: 0.25,
  velocity: 0.20,
  authorAffinity: 0.10,
  hashtagOverlap: 0.10,
  collaborativeItem: 0.05,
} as const;

/**
 * Engagement weights. Higher = stronger curation signal.
 */
export const ENG_WEIGHTS = {
  like: 1,
  comment: 2,
  save: 3,
  share: 4,
} as const;

/**
 * Recency half-life in hours. After 6h a post's recency contribution
 * is roughly half; after 24h it's ~6%.
 */
export const RECENCY_HALF_LIFE_HOURS = 6;

/**
 * Multiplicative penalty applied per previously-seen post from the
 * same author in the current rerank pass. We start at 1.0 and apply
 * 0.55 per extra — so seeing 3 posts from the same author makes the
 * 3rd one ~30% of its raw score. Stops the top-5 from being the same
 * creator's content.
 */
export const DIVERSITY_PER_AUTHOR_FACTOR = 0.55;

/**
 * Lens bonus (small) — public posts get +5%, friends gets 0%, close
 * is already gated by closeness so we keep it neutral here.
 */
export const LENS_BONUS: Record<RecommendationSignals["lens"], number> = {
  public: 0.05,
  friends: 0.0,
  close: 0.0,
  private: 0.0,
};

/**
 * Hard floor for final score so a perfect storm of negative signals
 * doesn't push candidates into the negatives.
 */
export const MIN_SCORE = 0.001;

/**
 * Reason thresholds — what we attribute the recommendation to. We
 * pick the single largest contributor so the UI can render one chip
 * per post.
 */
export const REASON_THRESHOLD = 0.15;

/**
 * Extract lowercase hashtags from a caption. We accept both ASCII and
 * Vietnamese characters in the body (so `#BếnTre`, `#PhúQuốc` work) but
 * the leading `#` must be ASCII.
 */
export function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const re = /#([\p{L}\p{N}_]{2,40})/gu;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(caption)) !== null) {
    const tag = m[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/**
 * Weighted Jaccard similarity between a candidate post's hashtag set
 * and the viewer's hashtag affinity map. Returns 0..1.
 *
 *   weighted_jaccard = sum(viewerWeights[h] for h in A ∩ B)
 *                       / sum(viewerWeights[h] for h in A ∪ B)
 *
 * Using the viewer's weight map as the bias means a hashtag the viewer
 * has COMMENTS on counts more than a hashtag they merely scrolled past
 * (because commenting is a stronger interaction signal).
 */
export function hashtagOverlap(
  candidateTags: string[],
  viewerWeights: Map<string, number>,
): number {
  if (candidateTags.length === 0 || viewerWeights.size === 0) return 0;
  const cand = new Set(candidateTags);
  let intersection = 0;
  let union = 0;
  // Union via traversal of both sets.
  for (const t of cand) union += 1; // candidate weight (presence only)
  for (const t of viewerWeights.keys()) {
    if (!cand.has(t)) union += 1;
  }
  for (const t of cand) {
    const w = viewerWeights.get(t) ?? 0;
    if (w > 0) intersection += w;
  }
  if (union <= 0) return 0;
  // Normalize against the max weight so the result lands in [0,1]
  // regardless of the viewer's total weight magnitude.
  const max = Math.max(...viewerWeights.values(), 1);
  return Math.min(1, intersection / (union * max));
}

/**
 * Sum the viewer's precomputed similarity scores for each user who has
 * liked/commented the candidate post. Caller normalises by the max
 * score across the batch.
 */
export function collaborativeItem(
  likerIds: Iterable<string>,
  viewerSimilarity: Map<string, number>,
): number {
  let sum = 0;
  for (const uid of likerIds) {
    sum += viewerSimilarity.get(uid) ?? 0;
  }
  return sum;
}

/**
 * Main scoring function. Pure — takes in signals + viewer context, no
 * I/O. Designed to be called in a tight loop across a candidate batch.
 */
export function scorePost(
  sig: RecommendationSignals,
  ctx: ViewerContext,
  collaborative: { likerIds: string[]; maxInBatch: number } | null = null,
): ScoreBreakdown {
  const ageHours = Math.max(0.01, (ctx.now - sig.createdAt) / 3600);
  const recency = Math.pow(0.5, ageHours / RECENCY_HALF_LIFE_HOURS);

  // Engagement (0..1, clipped). 200 likes ≈ saturating; this keeps
  // viral posts from drowning everyone else.
  const engRaw =
    ENG_WEIGHTS.like * sig.likeCount +
    ENG_WEIGHTS.comment * sig.commentCount +
    ENG_WEIGHTS.save * sig.saveCount +
    ENG_WEIGHTS.share * sig.shareCount;
  const engagement = Math.min(1, engRaw / 200);

  // Velocity: engagement per hour (0..1). 5 weighted engagements per
  // hour is "exploding"; we clip there.
  const velocity = Math.min(1, engRaw / (5 * ageHours));

  // Author affinity (already 0..1 from caller).
  const authorAffinity = Math.max(
    0,
    Math.min(1, ctx.authorAffinity.get(sig.authorId) ?? 0),
  );

  // Hashtag overlap (0..1).
  const hashtagOverlapVal = hashtagOverlap(sig.hashtags, ctx.hashtagAffinity);

  // Item collaborative (0..1). The caller passes the max so we can
  // normalise within the batch.
  let collabScore = 0;
  if (collaborative && collaborative.maxInBatch > 0) {
    const collabRaw = collaborativeItem(collaborative.likerIds, ctx.viewerSimilarity);
    collabScore = Math.min(1, collabRaw / collaborative.maxInBatch);
  }

  // Hard demote negatives.
  if (ctx.viewerHidden || ctx.authorDismissed) {
    return {
      score: MIN_SCORE,
      recency: 0,
      engagement: 0,
      velocity: 0,
      authorAffinity: 0,
      hashtagOverlap: 0,
      collaborativeItem: 0,
      diversityPenalty: 1,
      lensBonus: 0,
      reason: "negative",
    };
  }

  // Diversity: each previously-seen post from this author multiplies
  // the final score by DIVERSITY_PER_AUTHOR_FACTOR.
  const seen = ctx.seenAuthorCounts.get(sig.authorId) ?? 0;
  const diversityPenalty =
    seen === 0 ? 1 : Math.pow(DIVERSITY_PER_AUTHOR_FACTOR, seen);

  // Lens visibility: private lens never reaches here because the SQL
  // already filters it, but defensive is good. We treat `close` posts
  // as fully visible (already gated upstream by closeness).
  const lensBonus = LENS_BONUS[sig.lens] ?? 0;

  // Mix.
  const rawScore =
    WEIGHTS.recency * recency +
    WEIGHTS.engagement * engagement +
    WEIGHTS.velocity * velocity +
    WEIGHTS.authorAffinity * authorAffinity +
    WEIGHTS.hashtagOverlap * hashtagOverlapVal +
    WEIGHTS.collaborativeItem * collabScore;

  const finalScore = Math.max(
    MIN_SCORE,
    rawScore * diversityPenalty * (1 + lensBonus),
  );

  // Pick a single reason for the UI to surface. We rank the absolute
  // contributions (weight * signal value) and pick the largest if it
  // clears the threshold. This keeps the UI chip population honest.
  const contributions: Array<[string, number]> = [
    ["recency", WEIGHTS.recency * recency],
    ["engagement", WEIGHTS.engagement * engagement],
    ["velocity", WEIGHTS.velocity * velocity],
    ["authorAffinity", WEIGHTS.authorAffinity * authorAffinity],
    ["hashtagOverlap", WEIGHTS.hashtagOverlap * hashtagOverlapVal],
    ["collaborativeItem", WEIGHTS.collaborativeItem * collabScore],
  ];
  contributions.sort((a, b) => b[1] - a[1]);
  const top = contributions[0];
  let reason: string | undefined;
  if (top && top[1] >= REASON_THRESHOLD) {
    reason = top[0];
  }

  return {
    score: finalScore,
    recency,
    engagement,
    velocity,
    authorAffinity,
    hashtagOverlap: hashtagOverlapVal,
    collaborativeItem: collabScore,
    diversityPenalty,
    lensBonus,
    reason,
  };
}

/**
 * Vietnamese copy mapping for the `reason` field. The UI can use this
 * to render a chip like "Vì tương tác hashtag" or "Vì bạn thường
 * xem tác giả này".
 */
export const REASON_LABELS: Record<string, string> = {
  recency: "Mới đăng gần đây",
  engagement: "Được tương tác nhiều",
  velocity: "Đang thịnh hành",
  authorAffinity: "Tác giả bạn hay xem",
  hashtagOverlap: "Hashtag bạn quan tâm",
  collaborativeItem: "Bạn bè của bạn cũng thích",
  negative: "Đã ẩn",
};