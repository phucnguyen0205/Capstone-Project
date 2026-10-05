import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getDb } from "@/lib/db/server";
import { moderateContent } from "@/lib/ai";

/**
 * POST /api/admin/posts/remoderate
 *
 * Re-runs the AI moderation pipeline against every post whose
 * `moderation_status` is still `'pending'`. This handles rows that
 * were inserted by older code paths (or seeds) that bypassed the
 * moderation call, and is also useful when the AI provider was
 * unavailable at upload time.
 *
 * The pipeline calls Gemini for each row (with the same retry
 * policy as the inline upload flow), updates the row with the
 * decision, and returns a summary so the caller can see what
 * changed.
 *
 * Body (optional): { limit?: number, onlyIds?: string[] }
 *   - `limit`   cap how many rows are processed in this call
 *                (default: 50, max: 200). Each row costs 1 Gemini
 *                call, so we never let one request burn quota.
 *   - `onlyIds` re-moderate a specific set of post ids (e.g. the
 *                viewer's own latest upload).
 *
 * Auth: in dev this endpoint is open. Production should gate it
 * behind an admin role check.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return NextResponse.json(
    { ok: true },
    { status: 200, headers: corsHeaders },
  );
}

interface PendingRow {
  id: string;
  caption: string | null;
  media_url: string;
  media_type: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(
      200,
      Math.max(1, Number(body?.limit ?? 50)),
    );
    const onlyIds: string[] | undefined = Array.isArray(body?.onlyIds)
      ? body.onlyIds.filter((x: unknown) => typeof x === "string")
      : undefined;

    const db = getDb();

    const baseQuery = onlyIds && onlyIds.length > 0
      ? `SELECT id, caption, media_url, media_type
           FROM posts
          WHERE moderation_status = 'pending'
            AND id IN (${onlyIds.map(() => "?").join(",")})
          ORDER BY created_at DESC
          LIMIT ?`
      : `SELECT id, caption, media_url, media_type
           FROM posts
          WHERE moderation_status = 'pending'
          ORDER BY created_at DESC
          LIMIT ?`;
    const rows = (onlyIds && onlyIds.length
      ? db.prepare(baseQuery).all(...onlyIds, limit)
      : db.prepare(baseQuery).all(limit)) as PendingRow[];

    const results: Array<{
      id: string;
      previous: "pending";
      status: "approved" | "rejected" | "pending";
      reason?: string;
      score: number;
      method: "gemini" | "rule";
    }> = [];

    const updateStmt = db.prepare(
      `UPDATE posts
          SET moderation_status = ?,
              moderation_reason = ?,
              moderation_score = ?,
              moderated_at = ?
        WHERE id = ?`,
    );

    for (const row of rows) {
      const mod = await moderateContent(row.caption ?? "", row.media_url);
      const newStatus = mod.passed ? "approved" : "rejected";
      const now = Math.floor(Date.now() / 1000);

      // The "pending" status is left as-is only if the AI returned
      // a method that didn't actually decide (rare fallback path).
      const finalStatus: "approved" | "rejected" | "pending" =
        mod.method === "gemini" || mod.method === "rule"
          ? newStatus
          : "pending";

      updateStmt.run(
        finalStatus,
        mod.reason ?? null,
        mod.ruleScore,
        now,
        row.id,
      );

      results.push({
        id: row.id,
        previous: "pending",
        status: finalStatus,
        reason: mod.reason ?? undefined,
        score: mod.ruleScore,
        method: mod.method,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        processed: results.length,
        results,
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