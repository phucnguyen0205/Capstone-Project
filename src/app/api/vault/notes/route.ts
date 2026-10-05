import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET  /api/vault/notes        — list current user's notes (owner view).
 * POST /api/vault/notes        — create new note.
 *   Body: {
 *     content:      string,
 *     mood?:        "happy"|"sad"|"angry"|"neutral",
 *     unlockPoints?: number,   // optional per-note threshold
 *     visibility?:   "private"|"shared"
 *   }
 *
 * The owner always sees their own notes. Friends see shared notes only
 * if they pass the visibility check in `@/lib/vault.decideNoteVisibility`
 * — that's handled by `/api/vault/feed` (not this endpoint).
 */
export const dynamic = "force-dynamic";

const VALID_MOODS = new Set(["happy", "sad", "angry", "neutral"]);
const VALID_VISIBILITY = new Set(["private", "shared"]);

function genId() {
  return "vn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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
    const rows = db
      .prepare(
        `SELECT id, content, mood, created_at, updated_at,
                unlock_points, visibility
         FROM vault_notes
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .all(myId) as any[];

    const totalRow = db
      .prepare(`SELECT COUNT(*) as c FROM vault_notes WHERE user_id = ?`)
      .get(myId) as any;
    const weekStart = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const weekRow = db
      .prepare(
        `SELECT COUNT(*) as c FROM vault_notes
         WHERE user_id = ? AND created_at >= ?`,
      )
      .get(myId, weekStart) as any;
    const positiveRow = db
      .prepare(
        `SELECT COUNT(*) as c FROM vault_notes
         WHERE user_id = ? AND mood IN ('happy','neutral')`,
      )
      .get(myId) as any;
    const totalCount = (totalRow?.c ?? 0) as number;
    const positiveRatio =
      totalCount > 0 ? Math.round(((positiveRow?.c ?? 0) / totalCount) * 100) : 0;

    return NextResponse.json(
      {
        notes: rows.map((r) => ({
          id: r.id,
          content: r.content,
          mood: r.mood,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          unlockPoints: r.unlock_points,
          visibility: r.visibility,
        })),
        stats: {
          total: totalCount,
          thisWeek: weekRow?.c ?? 0,
          positiveRatio,
        },
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

export async function POST(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as any;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId: string = session.user.id;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      content?: string;
      mood?: string;
      unlockPoints?: number;
      visibility?: string;
    };
    const content = (body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Nội dung không được trống" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (content.length > 2000) {
      return NextResponse.json(
        { error: "Ghi chú tối đa 2000 ký tự" },
        { status: 400, headers: corsHeaders },
      );
    }
    const mood = body.mood && VALID_MOODS.has(body.mood) ? body.mood : "neutral";
    const visibility =
      body.visibility && VALID_VISIBILITY.has(body.visibility)
        ? body.visibility
        : "shared";
    const unlockPoints =
      typeof body.unlockPoints === "number" &&
      Number.isFinite(body.unlockPoints) &&
      body.unlockPoints >= 0 &&
      body.unlockPoints <= 1000
        ? Math.round(body.unlockPoints)
        : null;

    const now = Math.floor(Date.now() / 1000);
    const id = genId();
    const db = getDb();
    db.prepare(
      `INSERT INTO vault_notes
        (id, user_id, content, mood, created_at, updated_at,
         unlock_points, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, myId, content, mood, now, now, unlockPoints, visibility);

    return NextResponse.json(
      {
        id,
        content,
        mood,
        createdAt: now,
        unlockPoints,
        visibility,
      },
      { status: 201, headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
