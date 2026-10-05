import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import {
  markNotificationRead,
  deleteNotification,
} from "@/lib/notifications";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * PATCH /api/notifications/[id]
 *   Body: { read?: boolean }
 *
 *   Defaults to `read: true`. Updates the read state and returns the
 *   updated row. Always writes `read` as integer 0/1 to keep the legacy
 *   SELECT query consistent (see notifications helper for the bug).
 *
 * DELETE /api/notifications/[id]
 *   Hard-delete a notification. Only allowed when the user owns it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;
  const { id: notificationId } = await params;

  if (!notificationId) {
    return NextResponse.json({ error: "Thiếu notification id" }, { status: 400, headers: corsHeaders });
  }

  // Default behaviour: mark as read.
  const body = (await request.json().catch(() => ({}))) as { read?: boolean };
  const wantRead = body.read === false ? false : true;

  if (!wantRead) {
    // Re-open (mark as unread) is symmetric — we just write read=0.
    try {
      const { getDb } = await import("@/lib/db/server");
      const db = getDb();
      try {
        const result = db
          .prepare(
            `UPDATE notifications SET read = 0, read_at = NULL
             WHERE id = ? AND recipient_id = ?`
          )
          .run(notificationId, myId);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        if (result.changes === 0) {
          return NextResponse.json(
            { error: "Không tìm thấy thông báo" },
            { status: 404, headers: corsHeaders }
          );
        }
        return NextResponse.json({ ok: true, read: false }, { headers: corsHeaders });
      } catch (e) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
        throw e;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Lỗi server";
      return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
    }
  }

  const result = markNotificationRead(notificationId, myId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Không thể cập nhật thông báo" },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: notificationId,
      read: true,
      changed: result.changed,
    },
    { headers: corsHeaders }
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;
  const { id: notificationId } = await params;

  if (!notificationId) {
    return NextResponse.json({ error: "Thiếu notification id" }, { status: 400, headers: corsHeaders });
  }

  const ok = deleteNotification(notificationId, myId);
  if (!ok) {
    return NextResponse.json(
      { error: "Không tìm thấy thông báo hoặc bạn không có quyền xoá" },
      { status: 404, headers: corsHeaders }
    );
  }
  return NextResponse.json({ ok: true }, { headers: corsHeaders });
}
