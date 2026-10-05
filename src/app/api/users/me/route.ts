import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

/**
 * GET /api/users/me
 *
 * Returns the profile of the currently logged-in user (same shape as
 * /api/users/[id], minus the relationship block which is always isMe=true).
 */
export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(_req: NextRequest) {
  const session = await getSessionFromRequest(_req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;

  try {
    const db = getDb();
    const user = db
      .prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`)
      .get(myId) as any;
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    if (!user) {
      return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 }, { headers: corsHeaders });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      coverPhoto: user.cover_photo,
      birthday: user.birthday,
      location: user.location,
      website: user.website,
      phone: user.phone,
      gender: user.gender,
      occupation: user.occupation,
      education: user.education,
      hobbies: user.hobbies,
      relationshipStatus: user.relationship_status,
      createdAt: user.created_at,
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}