import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import {
  recomputeCloseness,
  readMirrorSettings,
  persistCloseness,
} from "@/lib/closeness.server";

/**
 * GET /api/groups/closeness/[friendId]
 *
 * Returns the closeness record between the viewer and a specific friend.
 * Used by MediaArea to decide how heavily to blur the friend's photos
 * and whether their videos are unlocked.
 *
 * Response: ClosenessInfo & { friendId: string }
 */
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ friendId: string }> },
) {
  const session = (await getSessionFromRequest(req)) as { user?: { id?: string } } | null;
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;
  const { friendId } = await params;

  if (!friendId || friendId === myId) {
    return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400, headers: corsHeaders });
  }

  try {
    const db = getDb();
    // Make sure the two are actually friends before exposing any data.
    const friendship = db
      .prepare(
        `SELECT 1 FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = ? AND receiver_id = ?)
                OR (requester_id = ? AND receiver_id = ?))`,
      )
      .get(myId, friendId, friendId, myId);

    if (!friendship) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Chưa kết bạn" }, { status: 403, headers: corsHeaders });
    }

    const cfg = readMirrorSettings(db);
    const info = recomputeCloseness(db, myId, friendId, cfg);
    // Cache for next request — avoids recomputing on every render.
    persistCloseness(db, info);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(
      { ...info, friendId },
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