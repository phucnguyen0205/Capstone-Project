import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import {
  decideNoteVisibility,
  loadMirrorSettings,
  type NoteRow,
} from "@/lib/vault";

/**
 * GET /api/vault/feed — shared vault entries for the viewer.
 *
 * Returns BOTH unlocked and locked `shared` notes from other users,
 * so the UI can render a "lock card" for entries the viewer still
 * needs more points to unlock. The `locked` flag tells the client
 * whether to show the full content or a blur+tooltip.
 *
 * Filter rules per row (delegated to `decideNoteVisibility`):
 *   - own notes: never appear in this feed (handled by the SQL
 *     `n.user_id != ?` clause).
 *   - private notes: not surfaced here at all.
 *   - notes with an explicit `denied` override for this viewer:
 *     filtered out by the helper (the helper returns
 *     `allowed: false` AND the SQL would still surface them, so we
 *     drop them client-side here too).
 *   - notes blocked by the points check: included with
 *     `locked: true` so the UI can render the "Cần X điểm" tooltip.
 *
 * Response shape:
 *   {
 *     items: SharedVaultNote[],         // unlocked + locked (not denied)
 *     globalDefaultUnlock: number,
 *     viewerId: string,                 // for the client to call back-end
 *                                       // details endpoint if needed
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
    const settings = loadMirrorSettings(db);

    // Pull a generous window of recent shared notes, then classify
    // each one with `decideNoteVisibility`. Doing it server-side keeps
    // the rule logic in one place (the helper) and lets us surface the
    // closeness/effective-unlock numbers without an N+1 fetch per row.
    const rows = db
      .prepare(
        `SELECT n.id, n.user_id, n.content, n.mood, n.created_at,
                n.updated_at, n.unlock_points, n.visibility,
                u.username, u.name, u.avatar
         FROM vault_notes n
         JOIN users u ON u.id = n.user_id
         WHERE n.visibility = 'shared'
           AND n.user_id != ?
           AND n.created_at >= ?
         ORDER BY n.created_at DESC
         LIMIT 200`,
      )
      .all(
        myId,
        Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60, // last 30 days
      ) as Array<
        NoteRow & {
          username: string;
          name: string | null;
          avatar: string | null;
        }
      >;

    const items: any[] = [];
    for (const row of rows) {
      const decision = decideNoteVisibility({
        db,
        note: row,
        viewerId: myId,
        noteMood: row.mood,
      });

      // Hard-block explicit denies. The decision helper returns
      // `allowed: false` for these, but we also need to keep them out
      // of the lock-card list — surfacing a "denied" card would tell
      // the viewer the note exists. We can't even show that the user
      // has blocked them (privacy), so we drop the row entirely.
      if (decision.override === "denied") continue;

      // pointsToUnlock is the delta the viewer still needs. The card
      // shows a "Cần X điểm" tooltip. When `allowed`, this is 0.
      const pointsToUnlock = decision.allowed
        ? 0
        : Math.max(0, decision.effectiveUnlock - decision.closenessPoints);

      items.push({
        id: row.id,
        content: row.content,
        mood: row.mood,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        unlockPoints: row.unlock_points,
        visibility: row.visibility,
        author: {
          id: row.user_id,
          username: row.username,
          name: row.name,
          avatar: row.avatar,
        },
        closenessPoints: decision.closenessPoints,
        effectiveUnlock: decision.effectiveUnlock,
        pointsToUnlock,
        override: decision.override,
        moodFiltered: decision.moodFiltered,
        // Server-computed: the client treats this as the source of
        // truth for "blur or not". A null override + points met =>
        // unlocked. An explicit "allowed" override also unlocks.
        locked: !decision.allowed,
      });
    }

    return NextResponse.json(
      {
        items,
        globalDefaultUnlock: settings.videoUnlockPoints,
        viewerId: myId,
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
