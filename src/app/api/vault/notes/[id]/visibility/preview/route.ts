import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import { decideNoteVisibility, loadMirrorSettings } from "@/lib/vault";

/**
 * GET /api/vault/notes/[id]/visibility/preview
 *
 * For a single note, project the visibility rule against every friend
 * the owner has and return a breakdown:
 *   - allowedByPoints   : friend qualifies via closeness alone
 *   - explicitAllowed   : friend has an "allowed" override
 *   - explicitDenied    : friend has a "denied" override (or mood-filtered denied)
 *   - hiddenByPoints    : friend does NOT have enough closeness (when no override applies)
 *
 * The owner uses this to sanity-check "ai sẽ thấy note này?" before
 * publishing. Response includes `noteMood` so the client knows which
 * mood was used in the projection (mood-filtered overrides depend on
 * the note's mood).
 */
export const dynamic = "force-dynamic";

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
      .prepare(
        `SELECT id, user_id, mood, unlock_points, visibility
         FROM vault_notes WHERE id = ?`,
      )
      .get(id) as
      | {
          id: string;
          user_id: string;
          mood: string;
          unlock_points: number | null;
          visibility: string;
        }
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

    const settings = loadMirrorSettings(db);
    const effectiveUnlock = note.unlock_points ?? settings.videoUnlockPoints;

    // All friends of the owner (accepted friendships either side).
    const friends = db
      .prepare(
        `SELECT u.id, u.username, u.name, u.avatar
         FROM friendships f
         JOIN users u
             ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
         WHERE f.status = 'accepted'
           AND (f.requester_id = ? OR f.receiver_id = ?)
         ORDER BY u.username ASC
         LIMIT 500`,
      )
      .all(myId, myId, myId) as Array<{
      id: string;
      username: string;
      name: string | null;
      avatar: string | null;
    }>;

    type Bucket = "allowedByPoints" | "explicitAllowed" | "explicitDenied" | "hiddenByPoints";
    const buckets: Record<Bucket, Array<{
      id: string;
      username: string;
      name: string | null;
      avatar: string | null;
      closenessPoints: number;
      moodFiltered?: boolean;
    }>> = {
      allowedByPoints: [],
      explicitAllowed: [],
      explicitDenied: [],
      hiddenByPoints: [],
    };

    for (const f of friends) {
      const decision = decideNoteVisibility({
        db,
        note: {
          id: note.id,
          user_id: note.user_id,
          content: "",
          mood: note.mood,
          created_at: 0,
          updated_at: 0,
          unlock_points: note.unlock_points,
          visibility: note.visibility,
        },
        viewerId: f.id,
        noteMood: note.mood,
      });
      const entry = {
        id: f.id,
        username: f.username,
        name: f.name,
        avatar: f.avatar,
        closenessPoints: decision.closenessPoints,
        moodFiltered: decision.moodFiltered,
      };
      if (!decision.allowed) {
        if (decision.override === "denied") {
          buckets.explicitDenied.push(entry);
        } else {
          buckets.hiddenByPoints.push(entry);
        }
      } else {
        if (decision.override === "allowed") {
          buckets.explicitAllowed.push(entry);
        } else {
          buckets.allowedByPoints.push(entry);
        }
      }
    }

    return NextResponse.json(
      {
        noteId: note.id,
        noteMood: note.mood,
        effectiveUnlock,
        totals: {
          friends: friends.length,
          willSee:
            buckets.allowedByPoints.length +
            buckets.explicitAllowed.length,
          willNotSee:
            buckets.explicitDenied.length + buckets.hiddenByPoints.length,
        },
        buckets,
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