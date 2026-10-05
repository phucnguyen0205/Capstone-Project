import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";
import {
  recomputeCloseness,
  readMirrorSettings,
} from "@/lib/closeness.server";

/**
 * GET /api/groups/tiers
 *
 * Counts of group posts by visibility lens (tier). The "group" is the set of
 * accepted friends + the viewer themselves. "private" lens posts are excluded
 * from the public counts — they only appear under "private" for the author.
 *
 * Response:
 *   { tiers: [{ key, label, count }, ...], total: number, recent: [{lens,...}] }
 *
 * The order is: public → friends → close → private
 */
export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(_req: NextRequest) {
  const session = (await getSessionFromRequest(_req)) as {
    user?: { id: string };
  } | null;
  if (!session?.user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập" },
      { status: 401, headers: corsHeaders },
    );
  }
  const myId = session.user.id;

  try {
    const db = getDb();

    // Counts grouped by lens, for posts visible to the viewer (own + friends')
    const rows = db
      .prepare(
        `SELECT p.lens as lens, COUNT(*) as c
         FROM posts p
         WHERE p.user_id = ?
            OR EXISTS (
              SELECT 1 FROM friendships f
              WHERE f.status = 'accepted'
                AND ((f.requester_id = ? AND f.receiver_id = p.user_id)
                     OR (f.requester_id = p.user_id AND f.receiver_id = ?))
            )
         GROUP BY p.lens`
      )
      .all(myId, myId, myId) as any[];

    const byLens: Record<string, number> = { public: 0, friends: 0, close: 0, private: 0 };
    for (const r of rows) byLens[r.lens] = r.c;

    // Recent (last 5) gallery items — image/video posts for the gallery strip
    const recent = db
      .prepare(
        `SELECT p.id, p.media_url, p.media_type, p.lens, p.created_at, p.caption
         FROM posts p
         WHERE (p.media_type = 'image' OR p.media_type = 'video')
           AND (p.user_id = ?
                OR EXISTS (
                  SELECT 1 FROM friendships f
                  WHERE f.status = 'accepted'
                    AND ((f.requester_id = ? AND f.receiver_id = p.user_id)
                         OR (f.requester_id = p.user_id AND f.receiver_id = ?))
                ))
           AND (p.user_id = ? OR p.lens != 'private')
         ORDER BY p.created_at DESC
         LIMIT 8`
      )
      .all(myId, myId, myId, myId) as any[];

    const tiers = [
      { key: "public", label: "Cấp 1 — Công khai", count: byLens.public },
      { key: "friends", label: "Cấp 2 — Bè bạn", count: byLens.friends },
      { key: "close", label: "Cấp 3 — Thân thiết", count: byLens.close },
      { key: "private", label: "Cấp 4 — Riêng tư", count: byLens.private },
    ];
    const total = tiers.reduce((s, t) => s + t.count, 0);

    // ── Closeness aggregates (tỉ xuất hoạt động trong nhóm) ─────────────
    // Recompute the viewer's closeness against every accepted friend so
    // the sidebar / dashboard can render the "Điểm thân thiết" header.
    const friendRows = (db as any)
      .prepare(
        `SELECT u.id FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.requester_id = ? THEN f.receiver_id
           ELSE f.requester_id
         END
         WHERE (f.requester_id = ? OR f.receiver_id = ?)
           AND f.status = 'accepted'`,
      )
      .all(myId, myId, myId) as Array<{ id: string }>;
    const closenessCfg = readMirrorSettings(db as any);
    const closeness = friendRows.map((r) =>
      recomputeCloseness(db as any, myId, r.id, closenessCfg),
    );
    const avgPoints = friendRows.length
      ? Math.round(
          closeness.reduce((s, c) => s + c.points, 0) / friendRows.length,
        )
      : 0;
    const avgStreak = friendRows.length
      ? Math.round(
          (closeness.reduce((s, c) => s + c.streakDays, 0) / friendRows.length) *
            10,
        ) / 10
      : 0;
    const videoUnlockedCount = closeness.filter(
      (c) => c.videoUnlocked,
    ).length;

    const payload = {
      tiers,
      total,
      recent: await Promise.all(
        recent.map(async (p) => {
          // Compute the unlock state so the sidebar tile can show a
          // "Cần X điểm để mở" tooltip on hover for close-friends
          // posts. For other lenses we report 0/unlocked.
          let pointsToUnlock = 0;
          let effectiveUnlock = 0;
          if (p.lens === "close") {
            const friendRow = db
              .prepare(
                `SELECT 1 FROM friendships
                 WHERE status = 'accepted'
                   AND ((requester_id = ? AND receiver_id = ?)
                     OR (requester_id = ? AND receiver_id = ?))`,
              )
              .get(myId, p.user_id, p.user_id, myId);
            if (friendRow) {
              const cfg = readMirrorSettings(db as any);
              effectiveUnlock = cfg.videoUnlockPoints;
              const closeness = recomputeCloseness(
                db as any,
                myId,
                p.user_id,
                cfg,
              );
              pointsToUnlock = Math.max(
                0,
                effectiveUnlock - closeness.points,
              );
            } else {
              // No friendship → tile is permanently locked for the
              // viewer. Report the full unlock as the gap so the UI
              // shows "Cần 60 điểm để mở".
              const cfg = readMirrorSettings(db as any);
              effectiveUnlock = cfg.videoUnlockPoints;
              pointsToUnlock = effectiveUnlock;
            }
          }
          return {
            id: p.id,
            mediaUrl: p.media_url,
            mediaType: p.media_type,
            lens: p.lens,
            createdAt: p.created_at,
            caption: p.caption,
            pointsToUnlock,
            effectiveUnlock,
          };
        }),
      ),
      closeness: {
        target: closenessCfg.imageFullPoints,
        videoUnlock: closenessCfg.videoUnlockPoints,
        streakBonusMax: closenessCfg.streakBonusMax,
        activityWindowDays: closenessCfg.activityWindowDays,
        averagePoints: avgPoints,
        averageStreakDays: avgStreak,
        totalFriends: friendRows.length,
        videoUnlockedCount,
        imageFullPoints: closenessCfg.imageFullPoints,
      },
    };

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json(payload, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: corsHeaders },
    );
  }
}