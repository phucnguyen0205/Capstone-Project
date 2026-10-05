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

/** POST — Accept, decline, or end a call */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as { user?: SessionUser } | null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const { callId, action } = await req.json();

  if (!callId || !action) {
    return NextResponse.json({ error: "Missing callId or action" }, { status: 400, headers: corsHeaders });
  }

  if (action === "accept") {
    const call = callManager.accept(callId, session.user.id);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404, headers: corsHeaders });
    }
    return NextResponse.json({ call, action: "accepted" }, { headers: corsHeaders });
  }

  if (action === "decline") {
    const ok = callManager.decline(callId, session.user.id);
    if (!ok) {
      return NextResponse.json({ error: "Call not found" }, { status: 404, headers: corsHeaders });
    }
    return NextResponse.json({ action: "declined" }, { headers: corsHeaders });
  }

  if (action === "end") {
    const ok = callManager.end(callId, session.user.id);
    if (!ok) {
      return NextResponse.json({ error: "Call not found" }, { status: 404, headers: corsHeaders });
    }
    return NextResponse.json({ action: "ended" }, { headers: corsHeaders });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: corsHeaders });
}
