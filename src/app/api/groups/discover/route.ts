import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/groups/discover?q=<text>&limit=<n>
 *
 * Returns public groups the caller is NOT a member of, filtered by a
 * text query that matches name/description. Excludes groups the
 * caller already belongs to so the search results are actionable
 * (every result is something the caller can join).
 *
 * Limit defaults to 30, max 50.
 */
export const dynamic = "force-dynamic";

interface DiscoverRow {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  creator_username: string;
  creator_name: string | null;
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "30"), 50);

  try {
    const db = getDb();
    // Use LIKE with %wildcards% for substring match. SQLite's LIKE is
    // case-insensitive for ASCII characters by default — Vietnamese
    // diacritics need ICU collation which we don't enable here, so the
    // match falls back to literal compare. Good enough for an MVP
    // search; we'll upgrade to FTS5 if usage grows.
    const rows = db
      .prepare(
        `SELECT g.id, g.name, g.description, g.avatar_url,
                u.username AS creator_username, u.name AS creator_name,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
         FROM groups g
         JOIN users u ON u.id = g.creator_id
         WHERE g.visibility = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM group_members gm2
             WHERE gm2.group_id = g.id AND gm2.user_id = ?
           )
           AND (? = '' OR g.name LIKE ? OR g.description LIKE ?)
         ORDER BY member_count DESC, g.created_at DESC
         LIMIT ?`
      )
      .all(myId, q, `%${q}%`, `%${q}%`, limit) as DiscoverRow[];
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      rows.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        avatarUrl: g.avatar_url,
        memberCount: g.member_count,
        creatorUsername: g.creator_username,
        creatorName: g.creator_name,
      })),
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}