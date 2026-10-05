import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { like, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

// GET /api/users/search?q=keyword — tìm user để bắt đầu chat

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }, { headers: corsHeaders });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const results = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      avatar: users.avatar,
    })
    .from(users)
    .where(q ? like(users.username, `%${q}%`) : eq(users.id, me.id))
    .limit(20);

  return NextResponse.json(results.filter((u) => u.id !== me.id));
}
