import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import {
  recomputeCloseness,
  readMirrorSettings,
} from "@/lib/closeness.server";

/**
 * GET /api/groups/closeness
 *
 * Returns the closeness record for every member of the viewer's group
 * (accepted friends). Used by the GroupsLeftSidebar to render the
 * horizontal "current points / target points" progress bar.
 *
 * Response: { items: Array<ClosenessInfo & { friendId: string }> }
 */
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(_req: NextRequest) {
  const session = (await getSessionFromRequest(_req)) as { user?: { id?: string } } | null;
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;

  try {
    const db = getDb();
    const cfg = readMirrorSettings(db);

    // Friend list mirrors /api/groups/members so the progress bar can be
    // rendered next to each avatar without an extra round-trip.
    const rows = db
      .prepare(
        `SELECT u.id
         FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.requester_id = ? THEN f.receiver_id
           ELSE f.requester_id
         END
         WHERE (f.requester_id = ? OR f.receiver_id = ?)
           AND f.status = 'accepted'`,
      )
      .all(myId, myId, myId) as Array<{ id: string }>;

    const items = rows.map((r) => {
      const info = recomputeCloseness(db, myId, r.id, cfg);
      return { ...info, friendId: r.id };
    });

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ items }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}