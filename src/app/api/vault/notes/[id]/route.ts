import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import {
  decideNoteVisibility,
  loadMirrorSettings,
  loadClosenessPoints,
  type NoteRow,
} from "@/lib/vault";

/**
 * GET    /api/vault/notes/[id] — read a single note. Owner always reads;
 *                                 others must pass the visibility check
 *                                 (override row + closeness points).
 * PATCH  /api/vault/notes/[id] — owner-only updates:
 *           - content / mood (edit text)
 *           - visibility ("private" | "shared")
 *           - unlockPoints (per-note threshold; null = use global default)
 * DELETE /api/vault/notes/[id] — owner-only delete.
 */
export const dynamic = "force-dynamic";

const VALID_MOODS = new Set(["happy", "sad", "angry", "neutral"]);
const VALID_VISIBILITY = new Set(["private", "shared"]);

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
    const row = db
      .prepare(
        `SELECT id, user_id, content, mood, created_at, updated_at,
                unlock_points, visibility
         FROM vault_notes WHERE id = ?`,
      )
      .get(id) as NoteRow | undefined;

    if (!row) {
      return NextResponse.json(
        { error: "Không tìm thấy ghi chú" },
        { status: 404, headers: corsHeaders },
      );
    }

    const decision = decideNoteVisibility({
      db,
      note: row,
      viewerId: myId,
      noteMood: row.mood,
    });
    // Authors always see their own content; viewers who fail the
    // visibility check get the metadata (so the client can show
    // "đang bị ẩn" + the unlock threshold) but no `content`.
    const isOwner = row.user_id === myId;
    if (!decision.allowed && !isOwner) {
      const authorInfo = db
        .prepare(`SELECT username, name, avatar FROM users WHERE id = ?`)
        .get(row.user_id) as
        | { username: string; name: string | null; avatar: string | null }
        | undefined;
      return NextResponse.json(
        {
          id: row.id,
          authorId: row.user_id,
          author: authorInfo,
          mood: row.mood,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          unlockPoints: row.unlock_points,
          visibility: row.visibility,
          closenessPoints: decision.closenessPoints,
          effectiveUnlock: decision.effectiveUnlock,
          override: decision.override,
          hidden: true,
        },
        { headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        id: row.id,
        content: row.content,
        mood: row.mood,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        unlockPoints: row.unlock_points,
        visibility: row.visibility,
        closenessPoints: decision.closenessPoints,
        effectiveUnlock: decision.effectiveUnlock,
        override: decision.override,
        hidden: false,
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

export async function PATCH(
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
      content?: string;
      mood?: string;
      unlockPoints?: number | null;
      visibility?: string;
    };

    const db = getDb();
    const existing = db
      .prepare(
        `SELECT user_id, content, mood, unlock_points, visibility
         FROM vault_notes WHERE id = ?`,
      )
      .get(id) as
      | {
          user_id: string;
          content: string;
          mood: string;
          unlock_points: number | null;
          visibility: string;
        }
      | undefined;
    if (!existing) {
      return NextResponse.json(
        { error: "Không tìm thấy ghi chú" },
        { status: 404, headers: corsHeaders },
      );
    }
    if (existing.user_id !== myId) {
      return NextResponse.json(
        { error: "Không có quyền chỉnh sửa" },
        { status: 403, headers: corsHeaders },
      );
    }

    const nextContent =
      typeof body.content === "string"
        ? body.content.trim()
        : existing.content;
    if (!nextContent) {
      return NextResponse.json(
        { error: "Nội dung không được trống" },
        { status: 400, headers: corsHeaders },
      );
    }
    if (nextContent.length > 2000) {
      return NextResponse.json(
        { error: "Ghi chú tối đa 2000 ký tự" },
        { status: 400, headers: corsHeaders },
      );
    }
    const nextMood =
      body.mood && VALID_MOODS.has(body.mood) ? body.mood : existing.mood;
    const nextVisibility =
      body.visibility && VALID_VISIBILITY.has(body.visibility)
        ? body.visibility
        : existing.visibility;
    let nextUnlock: number | null = existing.unlock_points;
    if (body.unlockPoints === null) {
      nextUnlock = null;
    } else if (typeof body.unlockPoints === "number") {
      if (
        !Number.isFinite(body.unlockPoints) ||
        body.unlockPoints < 0 ||
        body.unlockPoints > 1000
      ) {
        return NextResponse.json(
          { error: "unlockPoints không hợp lệ (0–1000)" },
          { status: 400, headers: corsHeaders },
        );
      }
      nextUnlock = Math.round(body.unlockPoints);
    }

    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `UPDATE vault_notes
       SET content = ?, mood = ?, visibility = ?, unlock_points = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      nextContent,
      nextMood,
      nextVisibility,
      nextUnlock,
      now,
      id,
      myId,
    );

    return NextResponse.json(
      {
        id,
        content: nextContent,
        mood: nextMood,
        visibility: nextVisibility,
        unlockPoints: nextUnlock,
        updatedAt: now,
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

export async function DELETE(
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
    const result = db
      .prepare(`DELETE FROM vault_notes WHERE id = ? AND user_id = ?`)
      .run(id, myId);
    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Không tìm thấy ghi chú" },
        { status: 404, headers: corsHeaders },
      );
    }
    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}
