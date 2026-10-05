import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getSessionFromRequest } from "@/lib/session";
import { callManager } from "@/lib/callManager";

interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/**
 * POST — Relay a WebRTC signaling message (offer / answer / ice / hangup)
 * to the other participant in the same call.
 *
 * Body: { callId, kind: "offer"|"answer"|"ice"|"hangup", payload? }
 *
 * For "offer" / "answer" → `payload` is the SDP description
 *   { type: "offer" | "answer", sdp: "<sdp string>" }
 * For "ice" → `payload` is { candidate, sdpMid, sdpMLineIndex }
 * For "hangup" → no payload required.
 */
export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as { user?: SessionUser } | null;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  let body: { callId?: string; kind?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders });
  }

  const { callId, kind, payload } = body;
  if (!callId || !kind) {
    return NextResponse.json({ error: "Missing callId or kind" }, { status: 400, headers: corsHeaders });
  }
  if (kind !== "offer" && kind !== "answer" && kind !== "ice" && kind !== "hangup") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400, headers: corsHeaders });
  }

  const ok = callManager.relaySignal(callId, session.user.id, {
    kind,
    payload,
  });
  if (!ok) {
    return NextResponse.json({ error: "Call not found" }, { status: 404, headers: corsHeaders });
  }
  return NextResponse.json({ relayed: true }, { headers: corsHeaders });
}
