import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { pairKey } from "@/lib/vault";

/**
 * GET /api/vault/friends
 *
 * Returns the caller's friend list enriched with closeness points.
 * Used by the Vault UI to render the "Người được thấy" / "Người bị ẩn"
 * picker when editing a note's visibility overrides.
 *
 * Friend list source: accepted friendships where either side is the
 * caller. Pair-key matches `@/lib/closeness-core` so the points
 * column aligns with what the rest of the app uses.
 *
 * Response: { items: Array<{ user: {...}, points: number }> }
 */
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as any;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId: string = session.user.id;

  try {
    const db = getDb();
    // We can't JOIN closeness on `pair_key = ?` with a single
    // pair(myId, myId) placeholder because the friend id differs per
    // row. Easier to: (1) fetch the friendship rows, (2) look up the
    // closeness points for each in a second pass. The list is bounded
    // (≤200) so two queries is fine.
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar, u.bio
         FROM friendships f
         JOIN users u
           ON u.id = CASE
             WHEN f.requester_id = ? THEN f.receiver_id
             ELSE f.requester_id
           END
         WHERE f.status = 'accepted'
           AND (f.requester_id = ? OR f.receiver_id = ?)
         ORDER BY u.username ASC
         LIMIT 200`,
      )
      .all(myId, myId, myId) as Array<{
      id: string;
      username: string;
      name: string | null;
      avatar: string | null;
      bio: string | null;
    }>;

    const items = rows.map((row) => {
      const pointRow = db
        .prepare(`SELECT points FROM closeness WHERE pair_key = ?`)
        .get(pairKey(myId, row.id)) as { points: number } | undefined;
      return {
        user: {
          id: row.id,
          username: row.username,
          name: row.name,
          avatar: row.avatar,
          bio: row.bio,
        },
        points: pointRow?.points ?? 0,
      };
    });

    // Sort by points DESC after the lookup so the highest-closeness
    // friends bubble to the top of the picker.
    items.sort((a, b) => b.points - a.points);

    return NextResponse.json({ items }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
