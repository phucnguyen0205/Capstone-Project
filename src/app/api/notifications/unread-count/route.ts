import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * GET /api/notifications/unread-count
 *
 * Returns just the unread count for the bell badge. Cheap to poll.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ count: 0 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;

  try {
    const db = getDb();
    const row = db
      .prepare(`SELECT COUNT(*) as c FROM notifications WHERE recipient_id = ? AND read = 0`)
      .get(myId) as any;
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ count: row.c ?? 0 }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
