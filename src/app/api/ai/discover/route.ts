import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { computeCompatibility, type UserProfile } from "@/lib/ai";

/**
 * GET /api/ai/discover
 *
 * Tinder-style AI-powered user discovery endpoint powered by Google Gemini.
 * Returns ranked users sorted by AI compatibility score.
 *
 * Query params:
 *   filter: "all" | "online" | "nearby" | "new"  (default: "all")
 *   limit: max 30 (default 20)
 *   search: string match on username / name
 */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const search = url.searchParams.get("search") ?? "";

  try {
    const db = getDb();

    // My profile
    const [myRow] = db
      .prepare(
        `SELECT id, name, username, avatar, bio, hobbies, occupation, gender,
                relationship_status, created_at
         FROM users WHERE id = ?`
      )
      .all(myId) as any[];
    if (!myRow) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy hồ sơ" }, { status: 404 }, { headers: corsHeaders });
    }

    const myHobbies = myRow.hobbies ?? "";
    const myBio = myRow.bio ?? "";

    // My accepted friends
    const myFriends = db
      .prepare(
        `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END AS fid
         FROM friendships
         WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`
      )
      .all(myId, myId, myId) as { fid: string }[];
    const myFriendSet = new Set(myFriends.map((f) => f.fid));

    // Build where clause
    const whereParts: string[] = ["id != ?"];
    const params: any[] = [myId];

    if (search) {
      whereParts.push("(username LIKE ? OR name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    switch (filter) {
      case "online":
        whereParts.push("is_online = 1");
        break;
      case "new":
        whereParts.push("created_at > ?");
        params.push(Math.floor(Date.now() / 1000) - 7 * 86400);
        break;
      default:
        break;
    }

    const whereSQL = whereParts.join(" AND ");
    const rows = db
      .prepare(
        `SELECT id, name, username, avatar, bio, hobbies, occupation, gender,
                relationship_status, created_at, last_active_at, is_online
         FROM users WHERE ${whereSQL}
         ORDER BY (avatar IS NOT NULL AND avatar != '') DESC,
                  (bio IS NOT NULL AND bio != '') DESC,
                  created_at DESC
         LIMIT 60`
      )
      .all(...params) as any[];

    const now = Math.floor(Date.now() / 1000);

    const myProfileForAI: UserProfile = {
      id: myId,
      name: myRow.name ?? myRow.username,
      username: myRow.username,
      avatar: myRow.avatar ?? null,
      bio: myBio,
      hobbies: myHobbies,
      occupation: myRow.occupation ?? null,
      gender: myRow.gender ?? null,
      relationshipStatus: myRow.relationship_status ?? null,
      isOnline: false,
      lastActiveAt: null,
      createdAt: myRow.created_at ?? now,
    };

    // Rank all candidates with AI (parallel)
    const ranked = await Promise.all(
      rows.map(async (u) => {
        const isOnline =
          !!(u.is_online) && (now - (u.last_active_at ?? 0)) < 5 * 60;
        const activeAgo = u.last_active_at ? now - u.last_active_at : null;
        const daysSinceJoin = (now - (u.created_at ?? now)) / 86400;

        // Mutual friend count
        const theirFriends = db
          .prepare(
            `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END AS fid
             FROM friendships
             WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`
          )
          .all(u.id, u.id, u.id) as { fid: string }[];
        const theirFriendSet = new Set(theirFriends.map((f) => f.fid));
        const mutualCount = [...myFriendSet].filter((id) => theirFriendSet.has(id)).length;

        const them: UserProfile = {
          id: u.id,
          name: u.name ?? null,
          username: u.username,
          avatar: u.avatar ?? null,
          bio: u.bio ?? null,
          hobbies: u.hobbies ?? null,
          occupation: u.occupation ?? null,
          gender: u.gender ?? null,
          relationshipStatus: u.relationship_status ?? null,
          isOnline,
          lastActiveAt: u.last_active_at ?? null,
          createdAt: u.created_at ?? now,
          mutualFriendCount: mutualCount,
        };

        // Gemini-powered compatibility scoring
        const ranking = await computeCompatibility(myProfileForAI, them);

        return {
          id: u.id,
          name: u.name ?? u.username,
          username: u.username,
          avatar: u.avatar,
          bio: u.bio,
          hobbies: u.hobbies ?? null,
          occupation: u.occupation ?? null,
          gender: u.gender ?? null,
          relationshipStatus: u.relationship_status ?? null,
          // AI compatibility
          aiScore: ranking.score,
          aiTier: ranking.tier,
          aiBreakdown: ranking.breakdown,
          aiReasons: ranking.reasons,
          aiMethod: ranking.method,
          // Meta
          mutualFriends: mutualCount,
          online: isOnline,
          lastActive: activeAgo !== null
            ? activeAgo < 60
              ? "Vừa xong"
              : activeAgo < 3600
                ? `${Math.floor(activeAgo / 60)} phút trước`
                : `${Math.floor(activeAgo / 3600)} giờ trước`
            : "Không hoạt động",
          joinedDaysAgo: Math.floor(daysSinceJoin),
        };
      })
    );

    // Sort by AI score descending
    ranked.sort((a, b) => b.aiScore - a.aiScore);

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({
      user: myId,
      filter,
      count: ranked.length,
      results: ranked.slice(0, limit, { headers: corsHeaders }),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
