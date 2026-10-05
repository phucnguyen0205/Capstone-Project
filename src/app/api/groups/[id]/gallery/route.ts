import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { getMemberRole } from "@/lib/groupPermissionsV2";
import {
  readMirrorSettings,
  recomputeCloseness,
} from "@/lib/closeness.server";

/**
 * GET /api/groups/[id]/gallery
 *
 * Returns the media (image/video) gallery for a single group. Unlike
 * `/api/groups/tiers` which is *global* (every post any friend ever
 * made), this endpoint only surfaces posts that have been explicitly
 * shared INTO the group via the `group_posts` table.
 *
 * Why we needed this:
 *   The old behaviour was: pull every image/video from the global
 *   posts table that the viewer is allowed to see (own + friends').
 *   That surfaced posts the member had NOT posted inside the group,
 *   so the sidebar's "Thư viện nhóm" showed off-topic content. We
 *   now join through `group_posts` to get only posts that actually
 *   live in this group.
 *
 * Visibility rules per row (mirrors the feed endpoint):
 *   - own post → always visible
 *   - friend's post in the group → visible if lens != "private" AND
 *     the post is approved.
 *   - lens "private" → visible only to the author themselves.
 *
 * Response:
 *   {
 *     recent: [{ id, mediaUrl, mediaType, lens, createdAt, caption,
 *                 pointsToUnlock, effectiveUnlock }],
 *     counts: { public, friends, close },
 *     total: number
 *   }
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
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
  const myId = session.user.id;
  const { id: groupId } = await params;

  const role = await getMemberRole(myId, groupId);
  if (role === null) {
    return NextResponse.json(
      { error: "Nhóm không tồn tại hoặc bạn không có quyền truy cập" },
      { status: 404, headers: corsHeaders },
    );
  }

  try {
    const db = getDb();

    // ── Counts per lens, scoped to posts that live in THIS group ───
    // Inner SELECT pulls the post ids belonging to the group; outer
    // GROUP BY tallies them. We filter visibility here too so the
    // counts match what the viewer would actually see.
    const countRows = db
      .prepare(
        `SELECT p.lens AS lens, COUNT(*) AS c
         FROM posts p
         WHERE p.id IN (SELECT gp.post_id FROM group_posts gp WHERE gp.group_id = ?)
           AND (p.user_id = ? OR p.lens != 'private')
           AND p.moderation_status = 'approved'
         GROUP BY p.lens`,
      )
      .all(groupId, myId) as Array<{ lens: string; c: number }>;
    const counts: Record<string, number> = {
      public: 0,
      friends: 0,
      close: 0,
    };
    for (const r of countRows) counts[r.lens] = r.c;
    const total = counts.public + counts.friends + counts.close;

    // ── Recent gallery items ───────────────────────────────────────
    // Same visibility filter as counts so the order matches the
    // what-would-the-viewer-see list. We exclude private lens posts
    // unless the viewer is the author.
    const recent = db
      .prepare(
        `SELECT p.id, p.user_id, p.media_url, p.media_type, p.lens,
                p.created_at, p.caption
         FROM posts p
         WHERE p.id IN (SELECT gp.post_id FROM group_posts gp WHERE gp.group_id = ?)
           AND (p.media_type = 'image' OR p.media_type = 'video')
           AND (p.user_id = ? OR p.lens != 'private')
           AND p.moderation_status = 'approved'
         ORDER BY p.created_at DESC
         LIMIT 8`,
      )
      .all(groupId, myId) as Array<{
        id: string;
        user_id: string;
        media_url: string;
        media_type: "image" | "video";
        lens: string;
        created_at: number;
        caption: string | null;
      }>;

    const cfg = readMirrorSettings(db as any);

    const recentPayload = recent.map((p) => {
      let pointsToUnlock = 0;
      let effectiveUnlock = 0;
      if (p.lens === "close") {
        // The viewer needs points with the AUTHOR (the person who
        // made the post), not with anyone else. Even within the same
        // group, close-lens posts can require extra closeness.
        const isFriend = db
          .prepare(
            `SELECT 1 FROM friendships
             WHERE status = 'accepted'
               AND ((requester_id = ? AND receiver_id = ?)
                 OR (requester_id = ? AND receiver_id = ?))`,
          )
          .get(myId, p.user_id, p.user_id, myId);
        effectiveUnlock = cfg.videoUnlockPoints;
        if (isFriend) {
          const c = recomputeCloseness(db as any, myId, p.user_id, cfg);
          pointsToUnlock = Math.max(0, effectiveUnlock - c.points);
        } else {
          // No friendship edge with the author → permanently locked
          // for the viewer. Show the full unlock as the distance so
          // the tile renders "Cần 60 điểm để mở".
          pointsToUnlock = effectiveUnlock;
        }
      }
      
      // Transform Cloudinary URLs for browser compatibility. Only inject
// transforms for IMAGES — videos already come through with the right
// codec from the upload step, and re-injecting `f_auto` here can cause
// Cloudinary to return a `.heic` payload (browser can't decode, video
// element retries → "video load lâu"). See commit message for context.
      const isVideo = p.media_type === "video";
      let mediaUrl = p.media_url;
      if (mediaUrl && typeof mediaUrl === "string" && !isVideo) {
        const match = mediaUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.+)$/);
        if (match) {
          const basePath = match[1];
          const tail = match[3];
          mediaUrl = `${basePath}f_auto,q_auto/${tail}`;
        }
      }
      
      return {
        id: p.id,
        mediaUrl,
        mediaType: p.media_type,
        lens: p.lens,
        createdAt: p.created_at,
        caption: p.caption,
        pointsToUnlock,
        effectiveUnlock,
      };
    });

    return NextResponse.json(
      { recent: recentPayload, counts, total },
      { headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}