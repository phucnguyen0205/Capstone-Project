import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { markAllNotificationsRead } from "@/lib/notifications";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * POST /api/notifications/read-all
 * PATCH /api/notifications/read-all
 *
 * Marks every unread notification for the current user as read.
 * Returns the number of rows updated so the client can confirm.
 */
async function handle(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401, headers: corsHeaders });
  }
  const myId = (session.user as any).id as string;

  try {
    const updated = markAllNotificationsRead(myId);
    return NextResponse.json({ ok: true, updated }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}

export const POST = handle;
export const PATCH = handle;
