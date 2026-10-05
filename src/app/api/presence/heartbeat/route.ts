import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * POST /api/presence/heartbeat
 *
 * Called periodically by the client (every ~30s) to update the user's
 * last_active_at timestamp. Same mechanism Facebook uses to power the
 * green-dot online indicator.
 *
 * Status semantics:
 *   - body { isOnline: true }  → user is actively here; set last_active_at = now, is_online = 1
 *   - body { isOnline: false } → user tab hidden / unmounted;   set is_online = 0 (still keep last_active_at)
 *   - sendBeacon (text/plain)  → page closing;                  set is_online = 0 (keep last_active_at)
 *
 * The "online dot" is computed by comparing last_active_at to now() —
 * so when the browser closes, the absence of heartbeats naturally ages
 * the timestamp and the dot transitions through just-now → today → offline.
 */

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  try {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    let isOnline = 1;

    // Robust body parsing — supports application/json AND text/plain (sendBeacon)
    const contentType = req.headers.get("content-type") ?? "";
    let parsedBody: any = {};
    try {
      if (contentType.includes("application/json")) {
        parsedBody = await req.json();
      } else if (contentType.includes("text/plain")) {
        const text = await req.text();
        parsedBody = JSON.parse(text);
      } else {
        // No body / unknown content-type — treat as online heartbeat
        parsedBody = {};
      }
    } catch {
      parsedBody = {};
    }

    if (parsedBody && parsedBody.isOnline === false) isOnline = 0;
    if (parsedBody && parsedBody.isOnline === true) isOnline = 1;

    db.prepare(
      `UPDATE users SET last_active_at = ?, is_online = ?, updated_at = ? WHERE id = ?`
    ).run(now, isOnline, now, myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true, lastActiveAt: now, isOnline }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  try {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE users SET is_online = 0, updated_at = ? WHERE id = ?`).run(now, myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch {
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  }
}
