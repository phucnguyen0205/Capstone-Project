import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/users/[id]/posts
 * Returns all posts owned by a user (or their username).
 * Visibility: viewer can always see their own posts; for others only public
 * posts (lens = 'public') OR the viewer's accepted friendship with the author.
 */
export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(_req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: paramId } = await params;

  try {
    const db = getDb();
    const user = db
      .prepare(`SELECT id FROM users WHERE id = ? OR username = ? LIMIT 1`)
      .get(paramId, paramId) as any;
    if (!user) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 }, { headers: corsHeaders });
    }
    const targetId = user.id;

    // Mutual friend = accepted friendship exists in BOTH directions
    // (requester=me AND receiver=target) AND (requester=target AND receiver=me)
    let isFriend = false;
    if (targetId === myId) {
      isFriend = true;
    } else {
      const mutual = db
        .prepare(
          `SELECT 1 FROM friendships
           WHERE status = 'accepted'
             AND (
               (requester_id = ? AND receiver_id = ?)
               AND EXISTS (
                 SELECT 1 FROM friendships f2
                 WHERE f2.status = 'accepted'
                   AND f2.requester_id = ? AND f2.receiver_id = ?
               )
             )
           LIMIT 1`
        )
        .get(myId, targetId, targetId, myId);
      isFriend = !!mutual;
    }

    const whereLens = isFriend
      ? "1=1" // mutual friend: can see all lenses
      : `(p.lens = 'public')`; // non-friend: only public

    const rows = db
      .prepare(
        `SELECT p.id, p.user_id, p.caption, p.media_url, p.media_type, p.lens, p.created_at,
                u.username, u.name, u.avatar
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE p.user_id = ? AND ${whereLens}
         ORDER BY p.created_at DESC
         LIMIT 60`
      )
      .all(targetId) as any[];

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      rows.map((p) => {
        // Transform raw Cloudinary URL to web-friendly format (heic→webp, mov→mp4)
        const rawUrl = p.media_url;
        let transformedUrl = rawUrl;
        
        // Match: https://res.cloudinary.com/{cloud}/{type}/upload/{anything}/{publicId}.{ext}
        // Extract the base path + publicId, then inject transformations
        const match = rawUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/)(.+)$/);
        if (match) {
          const basePath = match[1]; // https://res.cloudinary.com/{cloud}/{type}/upload/
          const tail = match[3];     // v1234567890/abcdef.heic
          const isVideo = p.media_type?.startsWith("video");
          
          if (isVideo) {
            // Don't transform — we used to inject `f_auto,q_auto` here
            // to convert `.mov` → `.mp4`, but on Cloudinary that
            // sometimes returns `.heic` for HEIC-encoded uploads
            // (browser can't decode it, video element retries).
            // Just pass the original URL.
          } else {
            // Inject image transforms: f_auto converts .heic to browser-supported format
            transformedUrl = `${basePath}f_auto,q_auto/${tail}`;
          }
        }

        return {
          id: p.id,
          userId: p.user_id,
          username: p.username,
          name: p.name,
          avatar: p.avatar,
          caption: p.caption,
          mediaUrl: transformedUrl,
          mediaType: p.media_type,
          lens: p.lens,
          createdAt: p.created_at,
        };
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
