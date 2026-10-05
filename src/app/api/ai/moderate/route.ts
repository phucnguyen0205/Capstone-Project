import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { moderateContent } from "@/lib/ai";

/**
 * POST /api/ai/moderate
 *
 * Run AI moderation on arbitrary content (caption + optional image URL).
 * Returns detailed breakdown using Google Gemini AI + rule-based engine.
 *
 * Body: { caption: string, imageUrl?: string }
 */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const session = await (await import("next-auth")).getServerSession(
    (await import("@/lib/auth")).authOptions
  );
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { caption = "", imageUrl } = body as { caption?: string; imageUrl?: string };

    const result = await moderateContent(caption, imageUrl);

    return NextResponse.json(
      {
        passed: result.passed,
        reason: result.reason ?? null,
        ruleScore: result.ruleScore,
        geminiFlagged: result.geminiFlagged,
        geminiScore: result.geminiScore,
        method: result.method,
        categories: result.categories ?? null,
        breakdown: {
          ruleBased: { score: result.ruleScore, passed: result.ruleScore > 70 },
          gemini: {
            flagged: result.geminiFlagged,
            score: result.geminiScore,
          },
        },
      },
      { status: 200 }
    , { headers: corsHeaders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
