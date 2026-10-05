import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { getMemberRole } from "@/lib/groupPermissionsV2";
import { moderateContent } from "@/lib/ai";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups/[id]/posts
 *
 * Returns posts that have been attached to this group via group_posts.
 *
 * Visibility rules:
 *   - Group is private + caller is not a member → 404 (don't leak).
 *   - Group is public  + caller is not a member → 404 as well. Public
 *     groups let non-members see metadata, but the *post stream* still
 *     requires membership — otherwise any public group would become a
 *     wall of strangers' posts. (We can revisit if you want a
 *     "followers can preview" mode.)
 *
 * Response: array of post objects with author + counters, same shape
 * as the legacy /api/groups/feed so GroupsFeed can use either endpoint
 * while Phase 2 rolls out.
 */
export const dynamic = "force-dynamic";

interface PostRow {
  id: string;
  user_id: string;
  caption: string;
  media_url: string;
  media_type: string;
  lens: string;
  created_at: number;
  author_username: string;
  author_name: string | null;
  author_avatar: string | null;
  is_online: number;
  last_active_at: number | null;
  like_count: number;
  comment_count: number;
  viewer_liked: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: groupId } = await params;

  const role = await getMemberRole(myId, groupId);
  if (role === null) {
    // Same response shape as a real 404 so we don't leak the group's
    // existence to non-members. The UI will treat this as "you don't
    // have access to this group's content".
    return NextResponse.json(
      { error: "Nhóm không tồn tại hoặc bạn không có quyền truy cập" },
      { status: 404, headers: corsHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type, p.lens, p.created_at,
                u.username AS author_username, u.name AS author_name, u.avatar AS author_avatar,
                u.is_online, u.last_active_at,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS like_count,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
                EXISTS (SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) AS viewer_liked
         FROM group_posts gp
         JOIN posts p ON p.id = gp.post_id
         JOIN users u ON u.id = p.user_id
         WHERE gp.group_id = ?
         ORDER BY gp.posted_at DESC, p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(myId, groupId, limit, offset) as PostRow[];

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const now = Math.floor(Date.now() / 1000);
    const data = rows.map((r) => {
      const lastActive = r.last_active_at ?? 0;
      const delta = Math.max(0, now - lastActive);
      const effectivelyOnline = !!r.is_online && delta < 5 * 60;
      
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
        caption: r.caption,
        mediaUrl: transformedUrl,
        mediaType: r.media_type,
        lens: r.lens,
        createdAt: r.created_at,
        author: {
          id: r.user_id,
          username: r.author_username,
          name: r.author_name,
          avatar: r.author_avatar,
          isOnline: effectivelyOnline,
        },
        likes: r.like_count,
        comments: r.comment_count,
        liked: !!r.viewer_liked,
      };
    });

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

/**
 * POST /api/groups/[id]/posts
 *
 * Two-mode endpoint, distinguished by the presence of `mediaUrl` in
 * the body:
 *
 *   1. Create a *group-scoped* post (the new, primary path).
 *      Body: { mediaUrl, mediaType, caption?, lens? }
 *      The post is created with `scope='group'` so it never appears
 *      on the community feed. It IS attached to this group in the
 *      same request via `group_posts`, in a single transaction.
 *
 *   2. Re-attach an existing feed-scoped post to this group.
 *      Body: { postId }
 *      Useful when the author posted on the community surface first
 *      and now wants to share it into one or more groups. Requires
 *      that the caller is the post's author.
 *
 * Both paths require membership in the group.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: groupId } = await params;

  const role = await getMemberRole(myId, groupId);
  if (role === null) {
    return NextResponse.json({ error: "Không có quyền" }, { status: 403, headers: corsHeaders });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // ── Path 1 — re-attach an existing post ──
  if (typeof body.postId === "string" && body.postId.trim()) {
    const postId = body.postId.trim();
    try {
      const db = getDb();
      const post = db
        .prepare(`SELECT user_id, lens FROM posts WHERE id = ?`)
        .get(postId) as { user_id: string; lens: string } | undefined;
      if (!post) {
        return NextResponse.json(
          { error: "Bài đăng không tồn tại" },
          { status: 404, headers: corsHeaders },
        );
      }
      if (post.user_id !== myId) {
        return NextResponse.json(
          { error: "Chỉ được chia sẻ bài của bạn" },
          { status: 403, headers: corsHeaders },
        );
      }
      db.prepare(
        `INSERT OR IGNORE INTO group_posts (id, group_id, post_id, posted_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        "gp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 11),
        groupId,
        postId,
        Math.floor(Date.now() / 1000),
      );
      return NextResponse.json({ ok: true }, { status: 201, headers: corsHeaders });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Lỗi server";
      return NextResponse.json(
        { error: message },
        { status: 500, headers: corsHeaders },
      );
    }
  }

  // ── Path 2 — create a group-scoped post ──
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : "";
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
  const caption = typeof body.caption === "string" ? body.caption : "";
  const lens = typeof body.lens === "string" ? body.lens : "friends";
  const publicId = typeof body.publicId === "string" ? body.publicId : null;
  const mediaWidth = typeof body.mediaWidth === "number" ? body.mediaWidth : null;
  const mediaHeight = typeof body.mediaHeight === "number" ? body.mediaHeight : null;

  if (!mediaUrl || !mediaType) {
    return NextResponse.json({ error: "Thiếu media" }, { status: 400, headers: corsHeaders });
  }
  if (!["image", "video"].includes(mediaType)) {
    return NextResponse.json(
      { error: "Loại media không hợp lệ" },
      { status: 400, headers: corsHeaders },
    );
  }
  if (!["public", "friends", "close"].includes(lens)) {
    return NextResponse.json(
      { error: "Lens không hợp lệ" },
      { status: 400, headers: corsHeaders },
    );
  }

  try {
    const db = getDb();
    const postId =
      "c_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 11);
    const now = Math.floor(Date.now() / 1000);

    // ─── AI Moderation pipeline ───────────────────────────────────────────
    const mod = await moderateContent(caption, mediaUrl);
    const modStatus = mod.passed ? "approved" : "rejected";
    const modScore = mod.ruleScore;
    const modReason = mod.reason ?? null;
    // ────────────────────────────────────────────────────────────────────

    // `scope='group'` so this post NEVER appears in the community
    // feed / reels. The group_posts row is inserted atomically; if
    // either insert fails the whole transaction rolls back so we
    // never leave an orphaned post.
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO posts
           (id, user_id, caption, media_url, media_type, public_id, lens,
            created_at, moderation_status, moderation_reason, moderation_score, 
            moderated_at, media_width, media_height, scope)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'group')`,
      ).run(
        postId,
        myId,
        caption,
        mediaUrl,
        mediaType,
        publicId,
        lens,
        now,
        modStatus,
        modReason,
        modScore,
        now,
        mediaWidth,
        mediaHeight,
      );
      db.prepare(
        `INSERT OR IGNORE INTO group_posts (id, group_id, post_id, posted_at)
         VALUES (?, ?, ?, ?)`,
      ).run(
        "gp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 11),
        groupId,
        postId,
        now,
      );
    });
    tx();

    return NextResponse.json(
      { 
        id: postId, 
        groupId, 
        scope: "group", 
        mediaUrl, 
        mediaType, 
        lens, 
        caption,
        moderation: {
          status: modStatus,
          reason: modReason,
          score: modScore,
          passed: mod.passed,
        }
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}