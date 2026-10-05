import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { pickRadar } from "@/lib/diary";

/**
 * GET /api/diary/radar
 *
 * Returns the user list for the "Ra khơi tìm bạn" radar visualisation
 * in the Diary right panel. The picker (`src/lib/diary.pickRadar`)
 * mixes online friends, recently active users, and a deterministic
 * stranger sample so the chart stays populated even for new accounts.
 *
 * Response shape:
 *   {
 *     items: RadarUser[],         // ordered: friends → active → strangers
 *     viewerId: string,
 *     onlineFriends: number,
 *     generatedAt: number
 *   }
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
    const items = pickRadar(db, myId);
    const onlineFriends = items.filter(
      (u) => u.origin === "friend" && u.isOnline,
    ).length;

    return NextResponse.json(
      {
        items,
        viewerId: myId,
        onlineFriends,
        generatedAt: Math.floor(Date.now() / 1000),
      },
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