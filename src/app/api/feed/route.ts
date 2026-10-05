import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { corsHeaders } from "@/lib/cors";
import { moderateContent } from "@/lib/ai";
import {
  extractHashtags,
  scorePost,
  type RecommendationSignals,
  type ScoreBreakdown,
} from "@/lib/recommend";
import {
  buildViewerContext,
  fetchLikersForPosts,
  fetchSaveCounts,
  fetchShareCounts,
} from "@/lib/recommend-db";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

function cuid() {
  return (
    "c_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 12)
  );
}

/**
 * GET /api/feed?tab=for-you|following|public|friends
 *
 * Tabs:
 *   for-you  (default) — public posts from everyone + own posts of any lens.
 *                        "Public posts" rule: anyone can see these on the
 *                        home page feed.
 *   following         — posts by the user's MUTUAL friends (both sides
 *                        follow each other). The friend-only "Following" tab
 *                        shows any lens from these mutual friends.
 *   public            — same as for-you (alias)
 *   friends           — same as following (alias)
 *
 * Visibility per row:
 *   - own posts: always visible (any lens)
 *   - public posts (lens='public'): visible to everyone
 *   - non-public posts from others: only visible if the viewer and author
 *     are mutual friends (status='accepted' friendship exists in both
 *     directions).
 *
 * Response: array of post objects joined with author info and counters
 * (like count, comment count, viewer-liked flag, viewer-saved flag).
 */
export const dynamic = "force-dynamic";

function ensureExtraTables(db: ReturnType<typeof getDb>) {
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
    CREATE TABLE IF NOT EXISTS dismissed_authors (
      id TEXT PRIMARY KEY,
      viewer_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(viewer_id, author_id)
    );
  `);
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;

  const { searchParams } = new URL(request.url);
  const tab = (searchParams.get("tab") ?? "for-you").toLowerCase();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  try {
    const db = getDb();
    ensureExtraTables(db);

    // Scope filter: only community posts (scope='feed') appear on the
    // home feed. Posts created directly in a group (scope='group')
    // stay in that group's stream and never leak to the community
    // surface. This is the wire that keeps "đăng lên nhóm" and
    // "đăng lên cộng đồng" cleanly separated.
    let forYouVisibility = `
      p.scope = 'feed'
      AND (
        p.user_id = ?
       OR p.lens = 'public'
       OR (
         p.lens != 'public'
         AND EXISTS (
           SELECT 1 FROM friendships f1
           WHERE f1.status = 'accepted'
             AND f1.requester_id = ? AND f1.receiver_id = p.user_id
         )
         AND EXISTS (
           SELECT 1 FROM friendships f2
           WHERE f2.status = 'accepted'
             AND f2.requester_id = p.user_id AND f2.receiver_id = ?
         )
       ))
    `;

    // Exclude posts the viewer has hidden from their own feed
    // AND posts the author has explicitly hidden from this viewer.
    forYouVisibility += `
      AND NOT EXISTS (
        SELECT 1 FROM post_hides
        WHERE post_hides.post_id = p.id
          AND (
            (post_hides.user_id = ? AND post_hides.scope = 'feed')
            OR (post_hides.scope = 'users' AND post_hides.target_user_id = ?)
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM dismissed_authors d
        WHERE d.viewer_id = ? AND d.author_id = p.user_id
      )
    `;

    let where = forYouVisibility;
    let params: unknown[] = [myId, myId, myId, myId, myId, myId];

    if (tab === "following" || tab === "friends") {
      // Show posts by MUTUAL friends + own posts.
      where = `
        p.scope = 'feed'
        AND (p.user_id = ?
         OR (
           p.user_id != ?
           AND EXISTS (
             SELECT 1 FROM friendships f1
             WHERE f1.status = 'accepted'
               AND f1.requester_id = ? AND f1.receiver_id = p.user_id
           )
           AND EXISTS (
             SELECT 1 FROM friendships f2
             WHERE f2.status = 'accepted'
               AND f2.requester_id = p.user_id AND f2.receiver_id = ?
           )
         ))
        AND NOT EXISTS (
          SELECT 1 FROM post_hides
          WHERE post_hides.post_id = p.id
            AND (
              (post_hides.user_id = ? AND post_hides.scope = 'feed')
              OR (post_hides.scope = 'users' AND post_hides.target_user_id = ?)
            )
        )
        AND NOT EXISTS (
          SELECT 1 FROM dismissed_authors d
          WHERE d.viewer_id = ? AND d.author_id = p.user_id
        )
      `;
      params = [myId, myId, myId, myId, myId, myId, myId];
    }

    // Pull a wider window than the page size so we can rerank in memory
    // and surface video posts more aggressively on the home feed. We
    // paginate the *reranked* slice, not the SQL one — that's why we
    // pull ~2x and trim down after applying the algorithm.
    params.push(limit * 2, offset);

    const rows = db
      .prepare(
        `SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type,
                p.public_id, p.lens, p.created_at, p.media_width, p.media_height,
                u.username, u.name as author_name, u.avatar as author_avatar,
                u.is_online, u.last_active_at
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE ${where}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params) as any[];

    // Counters
    const postIds = rows.map((r) => r.id);
    const likeCount: Record<string, number> = {};
    const commentCount: Record<string, number> = {};
    const myLikes = new Set<string>();
    const mySaves = new Set<string>();
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => "?").join(",");
      const likeRows = db
        .prepare(
          `SELECT post_id, COUNT(*) AS c FROM likes
           WHERE post_id IN (${placeholders}) GROUP BY post_id`
        )
        .all(...postIds) as any[];
      const commentRows = db
        .prepare(
          `SELECT post_id, COUNT(*) AS c FROM comments
           WHERE post_id IN (${placeholders}) GROUP BY post_id`
        )
        .all(...postIds) as any[];
      for (const r of likeRows) likeCount[r.post_id] = r.c;
      for (const r of commentRows) commentCount[r.post_id] = r.c;
      const likedRows = db
        .prepare(
          `SELECT post_id FROM likes WHERE user_id = ?
           AND post_id IN (${placeholders})`
        )
        .all(myId, ...postIds) as any[];
      const savedRows = db
        .prepare(
          `SELECT post_id FROM saves WHERE user_id = ?
           AND post_id IN (${placeholders})`
        )
        .all(myId, ...postIds) as any[];
      likedRows.forEach((r) => myLikes.add(r.post_id));
      savedRows.forEach((r) => mySaves.add(r.post_id));
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const now = Math.floor(Date.now() / 1000);

    // ── Recommendation rerank ──────────────────────────────────────────────
    // We pull ~2x the page size from SQL (ordered by created_at DESC) and
    // rerank with the multi-signal algorithm in `lib/recommend.ts`. The
    // blend mirrors Facebook's "stories you might like" + TikTok's "For You"
    // page: recency + engagement + velocity + author affinity + hashtag
    // overlap + item collaborative, with a diversity penalty to keep the
    // top results from collapsing into a single voice.
    //
    // See `src/lib/recommend.ts` for the full signal inventory + weights.

    const likers = fetchLikersForPosts(db, postIds);
    const saveCounts = fetchSaveCounts(db, postIds);
    const shareCounts = fetchShareCounts(db, postIds);

    // Precompute the maximum collaborative score across the candidate
    // batch so we can normalise the collaborative signal to [0,1].
    const viewerCtx = buildViewerContext(db, myId, now);
    let maxCollab = 0;
    for (const r of rows) {
      const likerIds = likers.get(r.id) ?? [];
      let s = 0;
      for (const uid of likerIds) s += viewerCtx.viewerSimilarity.get(uid) ?? 0;
      if (s > maxCollab) maxCollab = s;
    }

    const ranked = rows
      .map((r) => {
        const sig: RecommendationSignals = {
          createdAt: r.created_at,
          likeCount: likeCount[r.id] ?? 0,
          commentCount: commentCount[r.id] ?? 0,
          saveCount: saveCounts.get(r.id) ?? 0,
          shareCount: shareCounts.get(r.id) ?? 0,
          lens: (r.lens ?? "public") as RecommendationSignals["lens"],
          authorId: r.user_id,
          hashtags: extractHashtags(r.caption),
        };
        const breakdown: ScoreBreakdown = scorePost(
          sig,
          {
            ...viewerCtx,
            viewerLiked: myLikes.has(r.id),
            viewerSaved: mySaves.has(r.id),
            // Both hidden posts and dismissed authors are already filtered
            // at the SQL layer; we still pass false here so the score
            // doesn't enter the negative-signal branch.
            viewerHidden: false,
            authorDismissed: false,
          },
          {
            likerIds: likers.get(r.id) ?? [],
            maxInBatch: maxCollab,
          },
        );
        // Track per-author counts for the next iteration's diversity penalty.
        const prev = viewerCtx.seenAuthorCounts.get(r.user_id) ?? 0;
        viewerCtx.seenAuthorCounts.set(r.user_id, prev + 1);
        return { row: r, breakdown };
      })
      .sort((a, b) => b.breakdown.score - a.breakdown.score)
      .slice(0, limit);

    const data = ranked.map(({ row: r, breakdown }) => {
      const lastActive = r.last_active_at ?? 0;
      const isOnline = r.is_online ?? 0;
      const delta = Math.max(0, now - lastActive);
      const effectivelyOnline = !!isOnline && delta < 5 * 60;
      
      // Transform Cloudinary URLs to web-friendly formats (heic→webp, mov→mp4)
      let transformedUrl = r.media_url;
      if (r.media_url) {
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
        caption: r.caption,
        mediaUrl: transformedUrl,
        mediaType: r.media_type,
        publicId: r.public_id,
        lens: r.lens,
        createdAt: r.created_at,
        mediaWidth: r.media_width ?? undefined,
        mediaHeight: r.media_height ?? undefined,
        author: {
          id: r.user_id,
          username: r.username,
          name: r.author_name,
          avatar: r.author_avatar,
          isOnline: effectivelyOnline,
        },
        likes: likeCount[r.id] ?? 0,
        comments: commentCount[r.id] ?? 0,
        liked: myLikes.has(r.id),
        saved: mySaves.has(r.id),
        isOwn: r.user_id === myId,
        // Expose the top reason for the recommendation so the UI can
        // render a "Vì sao bài này ở đây?" chip if it wants.
        recReason: breakdown.reason ?? null,
      };
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/feed — create a post.
 * Body: { mediaUrl, mediaType, caption?, lens? }
 * The lens controls who can see it (public/friends/close).
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const userId = (session.user as any).id as string;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : "";
    const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
    const caption = typeof body.caption === "string" ? body.caption : "";
    const lens = typeof body.lens === "string" ? body.lens : "public";
    const mediaWidth = typeof body.mediaWidth === "number" ? body.mediaWidth : null;
    const mediaHeight = typeof body.mediaHeight === "number" ? body.mediaHeight : null;

    if (!mediaUrl || !mediaType) {
      return NextResponse.json({ error: "Thiếu media" }, { status: 400 });
    }
    if (!["image", "video"].includes(mediaType)) {
      return NextResponse.json({ error: "Loại media không hợp lệ" }, { status: 400 });
    }
    if (!["public", "friends", "close"].includes(lens)) {
      return NextResponse.json(
        { error: "Lens không hợp lệ (public/friends/close)" },
        { status: 400 }
      );
    }
    if (caption.length > 2000) {
      return NextResponse.json(
        { error: "Caption tối đa 2000 ký tự" },
        { status: 400 }
      );
    }

    const db = getDb();
    const id = cuid();
    const now = Math.floor(Date.now() / 1000);

    // ─── AI moderation (same pipeline as /api/posts) ────────────────
    // Previously this endpoint inserted with default 'pending', which
    // meant every post sat in the moderation queue forever and was
    // invisible to the rest of the app. Mirror the /api/posts path so
    // the AI/Gemini pipeline runs at insert time.
    const mod = await moderateContent(caption, mediaUrl);
    const modStatus = mod.passed ? "approved" : "rejected";
    const modScore = mod.ruleScore;
    const modReason = mod.reason ?? null;
    // ────────────────────────────────────────────────────────────────

    // Community feed post. Always scope='feed'. To share into a
    // group, the client must follow up with POST /api/groups/[id]/posts.
    db.prepare(
      `INSERT INTO posts (id, user_id, caption, media_url, media_type, public_id, lens,
                          created_at, moderation_status, moderation_reason,
                          moderation_score, moderated_at,
                          media_width, media_height, scope)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'feed')`
    ).run(
      id, userId, caption, mediaUrl, mediaType, lens, now,
      modStatus, modReason, modScore, now,
      mediaWidth, mediaHeight,
    );
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      {
        id,
        mediaUrl,
        mediaType,
        caption,
        lens,
        scope: "feed",
        moderationStatus: modStatus,
        moderationReason: modReason,
        moderationScore: modScore,
        passed: mod.passed,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}