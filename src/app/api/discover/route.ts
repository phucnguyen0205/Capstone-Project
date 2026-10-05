import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getDb } from "@/lib/db/server";
import { getSessionFromRequest } from "@/lib/session";
import { computeCompatibility, type UserProfile } from "@/lib/ai";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * Great-circle distance in km between two (lat, lng) pairs. Inputs are
 * decimal degrees. Result is in kilometres. We use the haversine
 * formula because Vietnam is wide enough (~1700 km N-S) that the
 * flat-earth approximation breaks down at city-to-city scale.
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Human-readable km label, e.g. "0.4 km", "12 km", "1.4k km". */
function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 10) / 10} km`;
  if (km < 10) return `${Math.round(km * 10) / 10} km`;
  if (km < 100) return `${Math.round(km)} km`;
  if (km < 1000) return `${Math.round(km / 5) * 5} km`;
  return `${(km / 1000).toFixed(1)}k km`;
}

/**
 * Facebook-style binary online presence algorithm.
 */
function computePresence(lastActiveAt: number, isOnline: number, now: number) {
  if (!lastActiveAt || lastActiveAt <= 0) {
    return {
      code: 0,
      label: "Chưa từng hoạt động",
      dotColor: "gray" as const,
      secondsAgo: null as number | null,
      isOnline: false,
    };
  }

  const delta = Math.max(0, now - lastActiveAt);
  const effectivelyOnline = !!isOnline && delta < 5 * 60;

  if (delta < 60 && effectivelyOnline) {
    return { code: 3, label: "Đang hoạt động", dotColor: "green" as const, secondsAgo: delta, isOnline: true };
  }
  if (delta < 5 * 60) {
    return { code: 2, label: "Vừa mới truy cập", dotColor: "green" as const, secondsAgo: delta, isOnline: effectivelyOnline };
  }
  if (delta < 60 * 60) {
    return { code: 1, label: `Hoạt động ${Math.floor(delta / 60)} phút trước`, dotColor: "muted" as const, secondsAgo: delta, isOnline: false };
  }
  if (delta < 24 * 60 * 60) {
    return { code: 1, label: `Hoạt động ${Math.floor(delta / 3600)} giờ trước`, dotColor: "muted" as const, secondsAgo: delta, isOnline: false };
  }
  if (delta < 7 * 24 * 60 * 60) {
    return { code: 1, label: `Hoạt động ${Math.floor(delta / 86400)} ngày trước`, dotColor: "muted" as const, secondsAgo: delta, isOnline: false };
  }
  return { code: 0, label: "Không hoạt động", dotColor: "gray" as const, secondsAgo: delta, isOnline: false };
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const myId = session ? (session.user as any).id : null;

  try {
    const db = getDb();
    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";

    // ─── My profile ────────────────────────────────────────────────────────
    let myProfile: any = null;
    if (myId) {
      myProfile = db
        .prepare(`SELECT hobbies, bio, avatar, name, username, gender, relationship_status, occupation
                  FROM users WHERE id = ?`)
        .get(myId);
    }

    const myHobbies = myProfile?.hobbies ?? "";
    const myBio = myProfile?.bio ?? "";

    // ─── My friends (for mutual friend counting) ───────────────────────────
    let myFriendIds = new Set<string>();
    if (myId) {
      const myFriends = db
        .prepare(
          `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END AS friend_id
           FROM friendships
           WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`
        )
        .all(myId, myId, myId) as { friend_id: string }[];
      myFriendIds = new Set(myFriends.map((f) => f.friend_id));
    }

    // ─── User query ──────────────────────────────────────────────────────
    let query = `SELECT id, username, name, avatar, bio, hobbies, gender,
                        relationship_status, occupation, created_at, last_active_at, is_online,
                        city, country, latitude, longitude
                 FROM users`;
    const params: any[] = [];

    if (myId) {
      query += " WHERE id != ?";
      params.push(myId);
    }
    if (search) {
      query += (myId ? " AND" : " WHERE");
      query += " (username LIKE ? OR name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    // ─── New Discover filters ─────────────────────────────────────────────
    // `filter` accepts one of: all | online | nearby | new
    //   online — currently online (is_online=1 AND last_active < 5 min)
    //   nearby — same city as the viewer (falls back to country if the
    //            viewer hasn't set a city)
    //   new    — joined within the last 7 days
    // Default is "all" so existing clients keep working.
    const filter = (url.searchParams.get("filter") ?? "all").toLowerCase();
    if (filter === "online") {
      query += (params.length ? " AND" : " WHERE");
      query += " is_online = 1 AND (last_active_at IS NULL OR last_active_at >= ?)";
      params.push(Math.floor(Date.now() / 1000) - 5 * 60);
    } else if (filter === "new") {
      query += (params.length ? " AND" : " WHERE");
      query += " created_at >= ?";
      params.push(Math.floor(Date.now() / 1000) - 7 * 86400);
    } else if (filter === "nearby" && myId) {
      // Read viewer's city/country once so we can match against it.
      // We do this lazily here (not in the first myProfile SELECT)
      // because the existing myProfile block only pulls the columns
      // it cares about — adding more there would be a wider refactor.
      const viewerRow = db
        .prepare(`SELECT city, country FROM users WHERE id = ?`)
        .get(myId) as { city: string | null; country: string | null } | undefined;
      const viewerCity = viewerRow?.city?.trim() || null;
      const viewerCountry = viewerRow?.country?.trim() || null;
      if (viewerCity) {
        query += (params.length ? " AND" : " WHERE");
        query += " city = ?";
        params.push(viewerCity);
      } else if (viewerCountry) {
        query += (params.length ? " AND" : " WHERE");
        query += " country = ?";
        params.push(viewerCountry);
      }
      // If the viewer hasn't set any location, `nearby` degrades to
      // "all" rather than returning zero results.
    }

    query += ` ORDER BY
      CASE WHEN bio IS NOT NULL AND bio != '' AND avatar IS NOT NULL AND avatar != '' THEN 0
           WHEN bio IS NOT NULL AND bio != '' THEN 1
           WHEN avatar IS NOT NULL AND avatar != '' THEN 2
           ELSE 3 END,
      created_at DESC
      LIMIT 50`;

    const users = db.prepare(query).all(...params);
    const now = Math.floor(Date.now() / 1000);

    // ─── My profile for AI ───────────────────────────────────────────────
    const myProfileForAI: UserProfile = {
      id: myId ?? "",
      name: myProfile?.name ?? myProfile?.username ?? null,
      username: myProfile?.username ?? "",
      avatar: myProfile?.avatar ?? null,
      bio: myBio,
      hobbies: myHobbies,
      occupation: myProfile?.occupation ?? null,
      gender: myProfile?.gender ?? null,
      relationshipStatus: myProfile?.relationship_status ?? null,
      isOnline: false,
      lastActiveAt: null,
      createdAt: myProfile?.created_at ?? now,
    };

    // Pull viewer coords once so we can compute real haversine distance
    // instead of returning the placeholder "0.5 km".
    let myLat: number | null = null;
    let myLng: number | null = null;
    if (myId) {
      const viewerCoords = db
        .prepare(`SELECT latitude, longitude FROM users WHERE id = ?`)
        .get(myId) as { latitude: number | null; longitude: number | null } | undefined;
      myLat = viewerCoords?.latitude ?? null;
      myLng = viewerCoords?.longitude ?? null;
    }

    // ─── Build profiles + mutual friend counts + AI ranking ──────────────
    // Count mutual friends in parallel
    const userWithMutual = await Promise.all(
      users.map(async (u: any) => {
        const presence = computePresence(u.last_active_at ?? 0, u.is_online ?? 0, now);

        let mutualCount = 0;
        if (myId) {
          const theirFriends = db
            .prepare(
              `SELECT CASE WHEN requester_id = ? THEN receiver_id ELSE requester_id END AS friend_id
               FROM friendships
               WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'`
            )
            .all(u.id, u.id, u.id) as { friend_id: string }[];
          const theirFriendSet = new Set(theirFriends.map((f) => f.friend_id));
          mutualCount = [...myFriendIds].filter((id) => theirFriendSet.has(id)).length;
        }

        const them: UserProfile = {
          id: u.id,
          name: u.name ?? null,
          username: u.username,
          avatar: u.avatar ?? null,
          bio: u.bio ?? null,
          hobbies: u.hobbies ?? null,
          occupation: u.occupation ?? null,
          gender: u.gender ?? null,
          relationshipStatus: u.relationship_status ?? null,
          isOnline: presence.isOnline,
          lastActiveAt: u.last_active_at ?? null,
          createdAt: u.created_at ?? now,
          mutualFriendCount: mutualCount,
        };

        // Compute AI compatibility (Gemini if key present, else rule-based)
        const ranking = await computeCompatibility(myProfileForAI, them);

        // Real haversine distance if both viewer + target have coords,
        // otherwise fall back to the legacy "0.5 km" placeholder.
        const distance =
          myLat !== null && myLng !== null &&
          typeof u.latitude === "number" && typeof u.longitude === "number"
            ? formatKm(haversineKm(myLat!, myLng!, u.latitude, u.longitude))
            : "0.5 km";

        return {
          id: u.id,
          name: u.name ?? u.username,
          username: u.username,
          avatar: u.avatar,
          bio: u.bio,
          age: Math.max(18, Math.min(60, Math.floor((now - (u.created_at ?? now)) / (365.25 * 24 * 3600)) + 22)),
          compatibility: ranking.score,
          compatibilityTier: ranking.tier,
          compatibilityBreakdown: ranking.breakdown,
          compatibilityReasons: ranking.reasons,
          distance,
          online: presence.isOnline,
          presenceCode: presence.code,
          presenceLabel: presence.label,
          dotColor: presence.dotColor,
          secondsAgo: presence.secondsAgo,
          hasProfile: !!(u.bio || u.avatar),
          mutualFriends: mutualCount,
          hobbies: u.hobbies ?? null,
          occupation: u.occupation ?? null,
          aiMethod: ranking.method,
          city: u.city ?? null,
          country: u.country ?? null,
        };
      })
    );

    // Sort by AI compatibility score descending
    userWithMutual.sort((a, b) => b.compatibility - a.compatibility);

// db.close() removed — DB is now a module-level singleton (src/lib/db/server.ts)
    const response = NextResponse.json(userWithMutual);
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Lỗi server";
    const response = NextResponse.json({ error: message }, { status: 500 });
    Object.entries(corsHeaders).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }
}
