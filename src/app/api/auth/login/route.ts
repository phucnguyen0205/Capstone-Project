import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";
import { corsHeaders } from "@/lib/cors";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  let sqlite: Database.Database | null = null;
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Thiếu email hoặc mật khẩu" },
        { status: 400, headers: corsHeaders }
      );
    }

    const dbPath = path.resolve(process.cwd(), "pulo.db");
    sqlite = new Database(dbPath);

    const user = sqlite
      .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
      .get(email) as any;

    if (!user) {
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không đúng" },
        { status: 401, headers: corsHeaders }
      );
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không đúng" },
        { status: 401, headers: corsHeaders }
      );
    }

    // Mint a NextAuth JWT so it can be used directly as `Authorization: Bearer <token>`
    // for the existing API routes that rely on `getServerSession`.
    const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-prod";
    const token = await encode({
      token: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        image: user.avatar,
        sub: user.id,
      },
      secret,
      maxAge: 30 * 24 * 60 * 60, // 30 days
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
          avatar: user.avatar,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[Login Error]", err);
    return NextResponse.json(
      { error: "Lỗi server" },
      { status: 500, headers: corsHeaders }
    );
  } finally {
    sqlite?.close();
  }
}
