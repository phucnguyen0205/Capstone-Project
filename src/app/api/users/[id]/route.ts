import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getDb } from "@/lib/db/server";

// ──────────────────────────────────────────────────────────────────────────
// GET /api/users/[id]
//
// Full profile lookup by id OR username, plus relationship stats and the
// viewer's relationship with this user.
//
// Stats:
//   - postCount      : total posts by this user
//   - friendCount    : count of accepted friendships (bidirectional)
//   - followersCount : accepted friendships where this user is the receiver
//   - followingCount : accepted friendships where this user is the requester
//
// Relationship (from viewer's perspective):
//   - isMe, isFriend, isFollowing, isFollower, requestSent, requestReceived
// ──────────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: paramId } = await params;

  try {
    const db = getDb();
    const user = db
      .prepare(`SELECT * FROM users WHERE id = ? OR username = ? LIMIT 1`)
      .get(paramId, paramId) as any;
    if (!user) {
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 }, { headers: corsHeaders });
    }

    const postCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE user_id = ?`).get(user.id) as any
    ).c;

    // friendCount = mutual friends only — both directions accepted.
    // We count distinct users where:
    //   - there's an accepted row with them as receiver (i.e. user follows them),
    //   - AND there's an accepted row with them as requester (i.e. they follow user).
    // This matches the "Bạn bè" definition everywhere in the UI.
    const friendCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT
              CASE WHEN f1.requester_id = ? THEN f1.receiver_id ELSE f1.requester_id END
            ) AS c
           FROM friendships f1
           WHERE f1.status = 'accepted'
             AND (
               (f1.requester_id = ? AND EXISTS (
                 SELECT 1 FROM friendships f2
                 WHERE f2.status = 'accepted'
                   AND f2.requester_id = f1.receiver_id AND f2.receiver_id = f1.requester_id
               ))
               OR
               (f1.receiver_id = ? AND EXISTS (
                 SELECT 1 FROM friendships f2
                 WHERE f2.status = 'accepted'
                   AND f2.requester_id = f1.receiver_id AND f2.receiver_id = f1.requester_id
               ))
             )`
        )
        .get(user.id, user.id, user.id) as any
    ).c;

    // followersCount = distinct users who have an accepted row pointing to me.
    // (In the mutual model two rows can describe the same relationship — we
    // deduplicate by requester_id so each follower is counted once.)
    const followersCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT requester_id) AS c FROM friendships
           WHERE status = 'accepted' AND receiver_id = ?`
        )
        .get(user.id) as any
    ).c;

    // followingCount = distinct users I have an accepted outgoing row toward.
    const followingCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT receiver_id) AS c FROM friendships
           WHERE status = 'accepted' AND requester_id = ?`
        )
        .get(user.id) as any
    ).c;

    let relationship: any = {
      isMe: user.id === myId,
      isFriend: false,
      isFollowing: false,
      isFollower: false,
      requestSent: false,
      requestReceived: false,
    };

    if (user.id !== myId) {
      // Check incoming (others → me) and outgoing (me → others) follow rows
      const incoming = db
        .prepare(
          `SELECT * FROM friendships
           WHERE requester_id = ? AND receiver_id = ?
           LIMIT 1`
        )
        .get(user.id, myId) as any;
      const outgoing = db
        .prepare(
          `SELECT * FROM friendships
           WHERE requester_id = ? AND receiver_id = ?
           LIMIT 1`
        )
        .get(myId, user.id) as any;

      // Mutual friend = both directions have status='accepted'
      const mutual = !!(
        incoming &&
        outgoing &&
        incoming.status === "accepted" &&
        outgoing.status === "accepted"
      );

      if (mutual) {
        relationship.isFriend = true;
        relationship.isFollowing = true; // both follow each other
        relationship.isFollower = true;
      } else {
        if (outgoing) {
          if (outgoing.status === "accepted") relationship.isFollowing = true;
          else if (outgoing.status === "pending") relationship.requestSent = true;
        }
        if (incoming) {
          if (incoming.status === "accepted") relationship.isFollower = true;
          else if (incoming.status === "pending") relationship.requestReceived = true;
        }
      }
    }

    // Presence (same algorithm as /api/discover)
    const now = Math.floor(Date.now() / 1000);
    const lastActiveAt: number = user.last_active_at ?? 0;
    const isOnlineFlag: number = user.is_online ?? 0;
    const delta = Math.max(0, now - lastActiveAt);
    const effectivelyOnline = !!isOnlineFlag && delta < 5 * 60;
    let presence: any;
    if (!lastActiveAt || lastActiveAt <= 0) {
      presence = { code: 0, label: "Chưa từng hoạt động", dotColor: "gray", isOnline: false };
    } else if (delta < 60 && effectivelyOnline) {
      presence = { code: 3, label: "Đang hoạt động", dotColor: "green", isOnline: true };
    } else if (delta < 5 * 60) {
      presence = { code: 2, label: "V�a mới truy cập", dotColor: "green", isOnline: effectivelyOnline };
    } else if (delta < 60 * 60) {
      presence = {
        code: 1,
        label: `Hoạt động ${Math.floor(delta / 60)} phút trước`,
        dotColor: "muted",
        isOnline: false,
      };
    } else if (delta < 24 * 60 * 60) {
      const hours = Math.floor(delta / 3600);
      presence = {
        code: 1,
        label: hours < 1 ? "Hoạt động hôm nay" : `Hoạt động ${hours} giờ trước`,
        dotColor: "muted",
        isOnline: false,
      };
    } else if (delta < 7 * 24 * 60 * 60) {
      const days = Math.floor(delta / 86400);
      presence = {
        code: 1,
        label: days === 1 ? "Hoạt động hôm qua" : `Hoạt động ${days} ngày trước`,
        dotColor: "muted",
        isOnline: false,
      };
    } else {
      presence = { code: 0, label: "Không hoạt động", dotColor: "gray", isOnline: false };
    }

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

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
      stats: {
        postCount,
        friendCount,
        followersCount,
        followingCount,
      },
      relationship,
      presence,
    }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/users/[id]
//
// Update editable profile fields of the CURRENT user. The [id] in the URL
// must match the session user id — we never let one user edit another.
// ──────────────────────────────────────────────────────────────────────────

const GENDERS = new Set(["male", "female", "other", "prefer_not_to_say"]);
const REL_STATUSES = new Set(["single", "in_relationship", "married", "complicated", ""]);

const STRING_FIELDS: Record<string, number> = {
  name: 60,
  bio: 500,
  location: 120,
  phone: 30,
  occupation: 120,
  education: 120,
  hobbies: 240,
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 }, { headers: corsHeaders });
  }
  const myId = (session.user as any).id;
  const { id: paramId } = await params;

  if (paramId !== myId) {
    return NextResponse.json(
      { error: "Bạn chỉ có thể chỉnh sửa hồ sơ của chính mình" },
      { status: 403 }
    , { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [field, maxLen] of Object.entries(STRING_FIELDS)) {
      if (field in body) {
        const value = body[field];
        if (value === null || value === "") {
          updates.push(`${field} = ?`);
          values.push(null);
        } else if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed.length > maxLen) {
            return NextResponse.json(
              { error: `Trường "${field}" tối đa ${maxLen} ký tự` },
              { status: 400 }
            , { headers: corsHeaders });
          }
          updates.push(`${field} = ?`);
          values.push(trimmed);
        } else {
          return NextResponse.json(
            { error: `Trường "${field}" phải là chuỗi` },
            { status: 400 }
          , { headers: corsHeaders });
        }
      }
    }

    for (const field of ["avatar", "coverPhoto", "website"] as const) {
      if (field in body) {
        const value = body[field];
        const col = field === "coverPhoto" ? "cover_photo" : field;
        if (value === null || value === "") {
          updates.push(`${col} = ?`);
          values.push(null);
        } else if (typeof value === "string") {
          try {
            new URL(value);
            updates.push(`${col} = ?`);
            values.push(value);
          } catch {
            return NextResponse.json(
              { error: `Trường "${field}" phải là URL hợp lệ` },
              { status: 400 }
            , { headers: corsHeaders });
          }
        } else {
          return NextResponse.json(
            { error: `Trường "${field}" phải là chuỗi URL` },
            { status: 400 }
          , { headers: corsHeaders });
        }
      }
    }

    if ("gender" in body) {
      const value = body.gender;
      if (value === null || value === "") {
        updates.push(`gender = ?`);
        values.push(null);
      } else if (typeof value === "string" && GENDERS.has(value)) {
        updates.push(`gender = ?`);
        values.push(value);
      } else {
        return NextResponse.json({ error: "Giá trị 'gender' không hợp lệ" }, { status: 400 }, { headers: corsHeaders });
      }
    }

    if ("relationshipStatus" in body) {
      const value = body.relationshipStatus;
      if (value === null || value === "") {
        updates.push(`relationship_status = ?`);
        values.push(null);
      } else if (typeof value === "string" && REL_STATUSES.has(value)) {
        updates.push(`relationship_status = ?`);
        values.push(value);
      } else {
        return NextResponse.json(
          { error: "Giá trị 'relationshipStatus' không hợp lệ" },
          { status: 400 }
        , { headers: corsHeaders });
      }
    }

    if ("birthday" in body) {
      const value = body.birthday;
      if (value === null || value === "") {
        updates.push(`birthday = ?`);
        values.push(null);
      } else if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        updates.push(`birthday = ?`);
        values.push(Math.floor(value));
      } else {
        return NextResponse.json(
          { error: "'birthday' phải là số (unix seconds) hoặc null" },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Không có trường nào để cập nhật" }, { status: 400 }, { headers: corsHeaders });
    }

    const now = Math.floor(Date.now() / 1000);
    updates.push(`updated_at = ?`);
    values.push(now);
    values.push(myId);

    const db = getDb();
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi server";
    return NextResponse.json({ error: message }, { status: 500 }, { headers: corsHeaders });
  }
}
