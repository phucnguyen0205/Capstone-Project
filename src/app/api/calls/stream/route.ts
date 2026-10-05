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

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const session = (await getSessionFromRequest(req)) as { user?: SessionUser } | null;
  if (!session?.user?.id) {
    return NextResponse.json("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const userId = session.user.id;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );
      callManager.addListener(userId, controller);
    },
    cancel(controller) {
      callManager.removeListener(userId, controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders,
    },
  });
}
