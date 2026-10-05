import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";

function generateId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

function formatPhone(phone: string): string {
  let formatted = phone.replace(/\D/g, "");
  if (formatted.startsWith("0")) {
    formatted = "84" + formatted.slice(1);
  }
  if (!formatted.startsWith("84")) {
    formatted = "84" + formatted;
  }
  return formatted;
}


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  let sqlite: Database.Database | null = null;
  try {
    const dbPath = path.resolve(process.cwd(), "pulo.db");
    sqlite = new Database(dbPath);

    // Create phone_otps table if not exists
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS phone_otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        otp TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);

    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("[Register] tables:", tables);
    if (!tables.some((t: { name: string }) => t.name === "users")) {
      console.error("[Register] FATAL: users table not found in DB at", dbPath);
      return NextResponse.json({ error: "Lỗi cấu hình server" }, { status: 500 }, { headers: corsHeaders });
    }

    const { email, username, password, name, phone } = await req.json();

    // Phone registration (no password required)
    if (phone && !email && !password) {
      const formattedPhone = formatPhone(phone);
      
      // Check if phone already exists
      const existingPhone = sqlite
        .prepare("SELECT id FROM users WHERE phone = ? LIMIT 1")
        .get(formattedPhone);
      if (existingPhone) {
        return NextResponse.json({ error: "Số điện thoại đã được sử dụng" }, { status: 409 }, { headers: corsHeaders });
      }

      const now = Math.floor(Date.now() / 1000);
      const userId = generateId();

      sqlite
        .prepare(
          "INSERT INTO users (id, email, username, password, name, phone, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(userId, `phone-${userId}@phone.pulo.app`, username || `user_${formattedPhone.slice(-8)}`, "PHONE_AUTH", name || formattedPhone.slice(-4), formattedPhone, "phone", now, now);

      return NextResponse.json({ id: userId, phone: formattedPhone, name: name || formattedPhone.slice(-4, { headers: corsHeaders }) }, { status: 201 });
    }

    // Email registration (traditional)
    if (!email || !username || !password) {
      return NextResponse.json({ error: "Thiếu thông tin bắt buộc" }, { status: 400 }, { headers: corsHeaders });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu phải từ 6 ký tự" }, { status: 400 }, { headers: corsHeaders });
    }

    // Raw SQL — no ORM, no caching issues
    const existingEmail = sqlite
      .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .get(email);
    if (existingEmail) {
      return NextResponse.json({ error: "Email đã được sử dụng" }, { status: 409 }, { headers: corsHeaders });
    }

    const existingUsername = sqlite
      .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
      .get(username);
    if (existingUsername) {
      return NextResponse.json({ error: "Tên đăng nhập đã được sử dụng" }, { status: 409 }, { headers: corsHeaders });
    }

    const hashed = await bcrypt.hash(password, 12);
    const now = Math.floor(Date.now() / 1000);
    const userId = generateId();

    sqlite
      .prepare(
        "INSERT INTO users (id, email, username, password, name, provider, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)"
      )
      .run(userId, email, username, hashed, name ?? username, "credentials", now, now);

    return NextResponse.json({ id: userId, email, username, name: name ?? username }, { status: 201 }, { headers: corsHeaders });
  } catch (err) {
    console.error("[Register Error]", err);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 }, { headers: corsHeaders });
  } finally {
    sqlite?.close();
  }
}
