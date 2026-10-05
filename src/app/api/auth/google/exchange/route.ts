import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import Database from "better-sqlite3";
import path from "path";
import { corsHeaders } from "@/lib/cors";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

/**
 * Exchange a Google OAuth authorization code for a NextAuth-compatible JWT.
 *
 * The Flutter mobile/web client opens Google's OAuth flow (using GIS or a
 * popup redirect), receives a `code`, and POSTs it here. We exchange that
 * code for Google's `id_token`, then mint a NextAuth JWT for the user.
 */
export async function POST(req: NextRequest) {
  let sqlite: Database.Database | null = null;
  try {
    const { code, redirectUri } = await req.json();
    if (!code) {
      return NextResponse.json(
        { error: "Thiếu authorization code" },
        { status: 400, headers: corsHeaders }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Server chưa cấu hình Google OAuth" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Exchange the authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri ?? "postmessage",
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("[Google Exchange] token endpoint error:", err);
      return NextResponse.json(
        { error: "Không thể đổi Google code" },
        { status: 400, headers: corsHeaders }
      );
    }

    const tokenJson: any = await tokenRes.json();
    const idToken = tokenJson.id_token;
    const accessToken = tokenJson.access_token;

    if (!idToken && !accessToken) {
      return NextResponse.json(
        { error: "Google không trả token" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Decode the id_token to extract user info
    let email = "";
    let name = "Google User";
    let picture = "";
    let googleSub = "";

    if (idToken) {
      const parts = idToken.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8")
        );
        email = payload.email ?? "";
        name = payload.name ?? payload.given_name ?? email;
        picture = payload.picture ?? "";
        googleSub = payload.sub ?? "";
      }
    }

    // If we only have an access_token, fall back to the userinfo endpoint
    if (!email && accessToken) {
      const userInfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (userInfoRes.ok) {
        const profile = await userInfoRes.json();
        email = profile.email ?? "";
        name = profile.name ?? email;
        picture = profile.picture ?? "";
        googleSub = profile.sub ?? "";
      }
    }

    if (!email) {
      return NextResponse.json(
        { error: "Không lấy được email từ Google" },
        { status: 400, headers: corsHeaders }
      );
    }

    const dbPath = path.resolve(process.cwd(), "pulo.db");
    sqlite = new Database(dbPath);

    let user = sqlite
      .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
      .get(email) as any;

    if (!user) {
      const now = Math.floor(Date.now() / 1000);
      const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      const username =
        email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_") +
        "_" +
        Math.random().toString(36).slice(-4);
      sqlite
        .prepare(
          "INSERT INTO users (id, email, username, password, name, avatar, provider, google_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(id, email, username, "GOOGLE_AUTH", name, picture, "google", googleSub, now, now);
      user = { id, email, username, name, avatar: picture, provider: "google" };
    } else {
      // Update google_id / avatar if missing
      if (!user.google_id || !user.avatar) {
        sqlite
          .prepare(
            "UPDATE users SET google_id = COALESCE(google_id, ?), avatar = COALESCE(avatar, ?), provider = COALESCE(provider, 'google') WHERE id = ?"
          )
          .run(googleSub, picture, user.id);
      }
    }

    const secret =
      process.env.NEXTAUTH_SECRET ??
      process.env.AUTH_SECRET ??
      "dev-secret-do-not-use-in-prod";
    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        image: user.avatar ?? picture,
        sub: user.id,
      },
      secret,
      maxAge: 30 * 24 * 60 * 60,
    });

    sqlite.close();
    sqlite = null;

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatar: user.avatar ?? picture,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[Google Exchange Error]", err);
    return NextResponse.json(
      { error: "Lỗi server" },
      { status: 500, headers: corsHeaders }
    );
  } finally {
    sqlite?.close();
  }
}
