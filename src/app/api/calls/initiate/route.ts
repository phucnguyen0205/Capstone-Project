import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { callManager } from "@/lib/callManager";

interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** POST — Initiate a call */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as { user?: SessionUser } | null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { conversationId, calleeId, calleeName, calleeAvatar, conversationName, isGroup } = await req.json();

  if (!conversationId || !calleeId || !conversationName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers: corsHeaders });
  }

  const existing = callManager.hasActiveCall(session.user.id);
  if (existing) {
    return NextResponse.json({ error: "Bạn đang có cuộc gọi khác" }, { status: 409, headers: corsHeaders });
  }

  const call = callManager.initiate({
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    callerId: session.user.id,
    callerName: session.user.name ?? "Người dùng",
    callerAvatar: session.user.image ?? null,
    calleeId,
    conversationId,
    conversationName,
    isGroup: isGroup ?? false,
  });

  return NextResponse.json({ call }, { status: 201, headers: corsHeaders });
}

/** GET — Check for existing call */
export async function GET(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as { user?: SessionUser } | null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const activeCall = callManager.getActiveForUser(session.user.id);
  return NextResponse.json({ call: activeCall }, { headers: corsHeaders });
}
