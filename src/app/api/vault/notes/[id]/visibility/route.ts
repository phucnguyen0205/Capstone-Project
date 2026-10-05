import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET    /api/vault/notes/[id]/visibility — list all per-user overrides
 *                                            for one note (owner only).
 *                                            Includes a suggestion list
 *                                            of friends (people the
 *                                            author has an existing
 *                                            closeness record with) so
 *                                            the UI can render "Người
 *                                            được thấy" / "Người bị ẩn"
 *                                            without a second round-trip.
 *
 * Each override row now also carries `moodFilter` (string | null): a
 * comma-separated list of moods the override applies to. NULL means
 * "all moods". The PUT endpoint accepts the same field on each entry.
 *
 * PUT    /api/vault/notes/[id]/visibility — replace all overrides for
 *                                            the note in a single call.
 *   Body: {
 *     entries: Array<{
 *       userId: string,
 *       state: "allowed"|"denied",
 *       moodFilter?: string | null
 *     }>
 *   }
 *
 * Notes without any override rows fall back to the global unlock-points
 * check (see `@/lib/vault.decideNoteVisibility`).
 */
export const dynamic = "force-dynamic";

const VALID_STATES = new Set(["allowed", "denied"]);
const VALID_MOODS = new Set(["happy", "sad", "angry", "neutral"]);

/** Normalise a mood list coming from the client. Returns null when the
 *  caller wants "all moods" or sent an invalid/empty list. */
function normaliseMoodFilter(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => VALID_MOODS.has(s));
  if (cleaned.length === 0) return null;
  // dedupe
  return Array.from(new Set(cleaned)).join(",");
}

function genId() {
  return "vnv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = (await getSessionFromRequest(req)) as any;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId: string = session.user.id;
  const { id } = await params;

  try {
    const db = getDb();
    const note = db
      .prepare(`SELECT user_id, unlock_points, visibility FROM vault_notes WHERE id = ?`)
      .get(id) as
      | { user_id: string; unlock_points: number | null; visibility: string }
      | undefined;
    if (!note) {
      return NextResponse.json(
        { error: "Không tìm thấy ghi chú" },
        { status: 404, headers: corsHeaders },
      );
    }
    if (note.user_id !== myId) {
      return NextResponse.json(
        { error: "Không có quyền xem" },
        { status: 403, headers: corsHeaders },
      );
    }

    const overrides = db
      .prepare(
        `SELECT v.user_id, v.state, v.mood_filter, v.created_at,
                u.username, u.name, u.avatar
         FROM vault_note_visibility v
         JOIN users u ON u.id = v.user_id
         WHERE v.note_id = ?
         ORDER BY v.created_at DESC`,
      )
      .all(id) as Array<{
      user_id: string;
      state: string;
      mood_filter: string | null;
      created_at: number;
      username: string;
      name: string | null;
      avatar: string | null;
    }>;

    return NextResponse.json(
      {
        unlockPoints: note.unlock_points,
        visibility: note.visibility,
        overrides: overrides.map((o) => ({
          userId: o.user_id,
          state: o.state,
          moodFilter: o.mood_filter,
          createdAt: o.created_at,
          user: {
            username: o.username,
            name: o.name,
            avatar: o.avatar,
          },
        })),
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = (await getSessionFromRequest(req)) as any;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId: string = session.user.id;
  const { id } = await params;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      entries?: Array<{
        userId?: string;
        state?: string;
        moodFilter?: unknown;
      }>;
    };
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const db = getDb();

    const note = db
      .prepare(`SELECT user_id FROM vault_notes WHERE id = ?`)
      .get(id) as { user_id: string } | undefined;
    if (!note) {
      return NextResponse.json(
        { error: "Không tìm thấy ghi chú" },
        { status: 404, headers: corsHeaders },
      );
    }
    if (note.user_id !== myId) {
      return NextResponse.json(
        { error: "Không có quyền chỉnh sửa" },
        { status: 403, headers: corsHeaders },
      );
    }

    // Filter & validate. We accept per-entry `moodFilter` (NULL = all
    // moods). The dedup key is (userId, state, moodFilter) — the same
    // user can have a blanket deny AND a mood-specific allow, etc.
    const seen = new Set<string>();
    const clean: Array<{
      userId: string;
      state: "allowed" | "denied";
      moodFilter: string | null;
    }> = [];
    for (const e of entries) {
      const userId = typeof e.userId === "string" ? e.userId : "";
      const state =
        typeof e.state === "string" && VALID_STATES.has(e.state)
          ? (e.state as "allowed" | "denied")
          : null;
      if (!userId || !state) continue;
      const moodFilter = normaliseMoodFilter(e.moodFilter);
      const key = `${userId}|${state}|${moodFilter ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clean.push({ userId, state, moodFilter });
    }

    const now = Math.floor(Date.now() / 1000);
    const tx = db.transaction(() => {
      // Wipe + rewrite — simpler than diffing and matches the PUT
      // semantics callers expect. Visibility is fully owned by this
      // endpoint, so a full replace is the simplest correct behaviour.
      db.prepare(`DELETE FROM vault_note_visibility WHERE note_id = ?`).run(id);
      const insert = db.prepare(
        `INSERT INTO vault_note_visibility
          (id, note_id, user_id, state, mood_filter, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const e of clean) {
        insert.run(genId(), id, e.userId, e.state, e.moodFilter, now);
      }
    });
    tx();

    return NextResponse.json(
      { ok: true, count: clean.length },
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