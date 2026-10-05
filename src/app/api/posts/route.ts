import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { moderateContent } from "@/lib/ai";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

function cuid() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }

  const userId = (session.user as any).id as string;

  try {
    const body = await request.json();
    const {
      mediaUrl,
      mediaType,
      caption,
      lens,
      publicId,
      mediaWidth,
      mediaHeight,
      // Note: `groupIds` is intentionally NOT accepted here. Posting
      // to the community feed and posting into a group are now two
      // separate operations. Sharing a feed post into a group must be
      // a follow-up call to POST /api/groups/[id]/posts.
    } = body;

    if (!mediaUrl || !mediaType) {
      return NextResponse.json({ error: "Thiếu media" }, { status: 400 });
    }

    const validTypes = ["image", "video"];
    if (!validTypes.includes(mediaType)) {
      return NextResponse.json({ error: "Loại media không hợp lệ" }, { status: 400 });
    }

    const validLenses = ["public", "friends", "close"];
    const postLens = validLenses.includes(lens) ? lens : "friends";

    const db = getDb();
    const postId = cuid();
    const now = Math.floor(Date.now() / 1000);

    // ─── AI Moderation pipeline ───────────────────────────────────────────
    const mod = await moderateContent(caption ?? "", mediaUrl);
    const modStatus = mod.passed ? "approved" : "rejected";
    const modScore = mod.ruleScore;
    const modReason = mod.reason ?? null;
    // ────────────────────────────────────────────────────────────────────

    // `scope='feed'` — this is a community/feed post. It is NEVER
    // auto-attached to any group. Sharing a feed post into a group is
    // an explicit, auditable follow-up step (POST /api/groups/[id]/posts).
    db.prepare(`
      INSERT INTO posts
        (id, user_id, caption, media_url, media_type, public_id, lens,
         created_at, moderation_status, moderation_reason,
         moderation_score, moderated_at, media_width, media_height, scope)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'feed')
    `).run(
      postId, userId, caption ?? "", mediaUrl, mediaType,
      publicId ?? null, postLens, now,
      modStatus, modReason, modScore, now,
      mediaWidth ?? null, mediaHeight ?? null
    );

    // Reject the legacy shape explicitly so the client gets a
    // definitive answer rather than silently dropping `groupIds`.
    if (Array.isArray(body.groupIds) && body.groupIds.length > 0) {
      return NextResponse.json(
        {
          error:
            "Đăng lên nhóm đã được tách riêng. Hãy gọi POST /api/groups/[id]/posts sau khi đăng để chia sẻ vào nhóm.",
        },
        { status: 400, headers: corsHeaders }
      );
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    // If rejected, still return 201 but with a warning so the client can show feedback
    return NextResponse.json(
      {
        id: postId,
        mediaUrl,
        mediaType,
        lens: postLens,
        caption,
        scope: "feed",
        moderationStatus: modStatus,
        moderationReason: modReason,
        moderationScore: modScore,
        passed: mod.passed,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }

  try {
    const db = getDb();
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20"));
    const offset = (page - 1) * limit;

    const posts = db.prepare(`
      SELECT p.*, u.name as author_name, u.username as author_username, u.avatar as author_avatar
      FROM posts p
      LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(posts, { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
