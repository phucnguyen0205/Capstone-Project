import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST /api/presence/bulk
 * Body: { userIds: string[] }
 * Returns: { [userId]: { code, label, dotColor, secondsAgo, isOnline } }
 *
 * Same binary algorithm as /api/discover but scoped to a small list of users
 * (used by chat panels to show online dots next to conversation participants).
 * Decays based on now() - last_active_at so it stays accurate even if the
 * user closed their browser.
 */
function computePresence(lastActiveAt: number, isOnline: number, now: number) {
  if (!lastActiveAt || lastActiveAt <= 0) {
    return { code: 0, label: "Chưa từng hoạt động", dotColor: "gray", secondsAgo: null, isOnline: false };
  }
  const delta = Math.max(0, now - lastActiveAt);
  const effectivelyOnline = !!isOnline && delta < 5 * 60;

  if (delta < 60 && effectivelyOnline) {
    return { code: 3, label: "Đang hoạt động", dotColor: "green", secondsAgo: delta, isOnline: true };
  }
  if (delta < 5 * 60) {
    return { code: 2, label: "Vừa mới truy cập", dotColor: "green", secondsAgo: delta, isOnline: effectivelyOnline };
  }
  if (delta < 60 * 60) {
    return {
      code: 1,
      label: `Hoạt động ${Math.floor(delta / 60)} phút trước`,
      dotColor: "muted",
      secondsAgo: delta,
      isOnline: false,
    };
  }
  if (delta < 24 * 60 * 60) {
    const hours = Math.floor(delta / 3600);
    return {
      code: 1,
      label: hours < 1 ? "Hoạt động hôm nay" : `Hoạt động ${hours} giờ trước`,
      dotColor: "muted",
      secondsAgo: delta,
      isOnline: false,
    };
  }
  if (delta < 7 * 24 * 60 * 60) {
    const days = Math.floor(delta / 86400);
    return {
      code: 1,
      label: days === 1 ? "Hoạt động hôm qua" : `Hoạt động ${days} ngày trước`,
      dotColor: "muted",
      secondsAgo: delta,
      isOnline: false,
    };
  }
  return { code: 0, label: "Không hoạt động", dotColor: "gray", secondsAgo: delta, isOnline: false };
}

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }

  try {
    const db = getDb();
    const body = (await req.json().catch(() => ({}))) as { userIds?: string[] };
    const ids = Array.isArray(body.userIds) ? body.userIds.slice(0, 50) : [];
    if (ids.length === 0) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({}, { headers: corsHeaders });
    }

    const placeholders = ids.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT id, last_active_at, is_online FROM users WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{ id: string; last_active_at: number | null; is_online: number | null }>;
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    const now = Math.floor(Date.now() / 1000);
    const result: Record<string, ReturnType<typeof computePresence>> = {};
    for (const row of rows) {
      result[row.id] = computePresence(row.last_active_at ?? 0, row.is_online ?? 0, now);
    }
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
