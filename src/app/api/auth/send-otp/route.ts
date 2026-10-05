import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { sendOtpSms } from "@/lib/sms";

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Format phone number to standard format
function formatPhone(phone: string): string {
  // Remove all non-digit characters
  let formatted = phone.replace(/\D/g, "");
  
  // Add Vietnamese country code if not present
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

    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json(
        { error: "Số điện thoại là bắt buộc" },
        { status: 400, headers: corsHeaders },
      );
    }

    const formattedPhone = formatPhone(phone);

    // Validate phone format (Vietnamese phone numbers)
    // After formatPhone(): 84 + 10 digits = 11 chars. The leading 0
    // of the local number is replaced with 84, so the second digit
    // can be any mobile prefix (3/5/7/8/9) — keep it loose to
    // accept both mobile (10 digits) and the longer landline-style
    // numbers that may slip through.
    if (!/^84\d{9,10}$/.test(formattedPhone)) {
      return NextResponse.json(
        { error: "Số điện thoại không hợp lệ" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Delete old OTPs for this phone
    sqlite.prepare("DELETE FROM phone_otps WHERE phone = ?").run(formattedPhone);

    // Generate new OTP
    const otp = generateOTP();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 300; // 5 minutes

    // Save OTP to database
    sqlite
      .prepare("INSERT INTO phone_otps (phone, otp, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(formattedPhone, otp, now, expiresAt);

    // Send OTP via Twilio (fallback: console.log nếu chưa cấu hình)
    const smsResult = await sendOtpSms({
      phone: formattedPhone,
      otp,
      expiresInSeconds: 300,
    });
    console.log(
      `[OTP] OTP for ${formattedPhone}: ${otp} | channel=${smsResult.channel}${
        smsResult.error ? ` | error=${smsResult.error}` : ""
      }`,
    );

    const isDev = process.env.NODE_ENV === "development";

    return NextResponse.json(
      {
        success: true,
        message:
          smsResult.channel === "twilio"
            ? "Mã OTP đã được gửi đến số điện thoại của bạn"
            : "Mã OTP đã được tạo (dev mode)",
        s_charge: smsResult.channel,           // "twilio" | "dev-log"
        // Dev: vẫn trả OTP để test trên UI. Production: tắt.
        otp: isDev ? otp : undefined,
        expiresIn: 300,
      },
      { headers: corsHeaders },
    );
  } catch (err) {
    console.error("[Send OTP Error]", err);
    return NextResponse.json(
      { error: "Lỗi server" },
      { status: 500, headers: corsHeaders },
    );
  } finally {
    sqlite?.close();
  }
}
