import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import {
  fetchEncounterHistory,
  markEncounterViewed,
  pickOrFetchTodaysEncounter,
} from "@/lib/diary";

/**
 * GET  /api/diary/encounters
 *   Returns the viewer's encounter history (most recent first) plus
 *   today's pick (auto-created on the first call after a day boundary
 *   so the right-panel card is stable for the rest of the day).
 *
 *   Response shape:
 *     {
 *       today: EncounterPick | null,   // for the card on the right panel
 *       history: EncounterHistoryRow[]
 *     }
 *
 * POST /api/diary/encounters
 *   Body: { action: "view"|"dismiss", encounterId: string, note?: string }
 *   Marks the encounter as viewed/dismissed or updates the optional note.
 *
 * The picker itself never runs server-side on a cron — the GET endpoint
 * is responsible for lazy-pick, so we don't have to add a background
 * job just for a daily "chạm mặt" moment.
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
    const today = pickOrFetchTodaysEncounter(db, myId);
    const history = fetchEncounterHistory(db, myId, 30);

    // Mark today as viewed on first GET so we know it's been seen.
    if (today && !today.viewed) {
      markEncounterViewed(db, myId, today.id);
      today.viewed = true;
    }

    return NextResponse.json(
      { today, history },
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
      action?: string;
      encounterId?: string;
      note?: string;
    };
    const action = body.action;
    const encounterId = typeof body.encounterId === "string" ? body.encounterId : "";
    if (!encounterId) {
      return NextResponse.json(
        { error: "Thiếu encounterId" },
        { status: 400, headers: corsHeaders },
      );
    }
    const db = getDb();

    if (action === "view") {
      markEncounterViewed(db, myId, encounterId);
      return NextResponse.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === "dismiss") {
      const today = pickOrFetchTodaysEncounter(db, myId);
      if (today && today.id !== encounterId) {
        return NextResponse.json(
          { error: "Không thể bỏ qua encounter cũ" },
          { status: 400, headers: corsHeaders },
        );
      }
      const { dismissEncounter, setEncounterNote } = await import("@/lib/diary");
      dismissEncounter(db, myId, encounterId);
      // Pick a fresh one for the rest of the day.
      const next = pickOrFetchTodaysEncounter(db, myId);
      return NextResponse.json(
        { ok: true, next },
        { headers: corsHeaders },
      );
    }

    if (action === "note") {
      const note =
        typeof body.note === "string" ? body.note.slice(0, 500) : "";
      const { setEncounterNote } = await import("@/lib/diary");
      setEncounterNote(db, myId, encounterId, note);
      return NextResponse.json({ ok: true }, { headers: corsHeaders });
    }

    return NextResponse.json(
      { error: "action không hợp lệ" },
      { status: 400, headers: corsHeaders },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}