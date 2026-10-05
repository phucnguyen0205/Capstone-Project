import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

// Format phone number to standard format
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

/**
 * POST /api/auth/verify-otp
 *
 * Phone-based auth is split into two steps:
 *   1. /api/auth/send-otp      → generate OTP, store in phone_otps table
 *   2. /api/auth/verify-otp    → validate OTP server-side, then the client
 *                                 calls `signIn("phone", { phone, otp })`
 *                                 which goes through the NextAuth phone
 *                                 credentials provider and mints the JWT.
 *
 * This route ONLY validates the OTP. The actual session creation is handled
 * by NextAuth's phone credentials provider on the client side. Doing the
 * signIn entirely server-side would require either a server-side `signIn`
 * helper (not shipped by next-auth v4 for App Router) or a manual cookie
 * mint, which is fragile. Keeping the responsibilities split here is the
 * safest pattern.
 */

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  let sqlite: Database.Database | null = null;
  try {
    const { phone, otp } = await req.json();

    if (!phone || !otp) {
      return NextResponse.json(
        { error: "Số điện thoại và mã OTP là bắt buộc" },
        { status: 400 }
      , { headers: corsHeaders });
    }

    const formattedPhone = formatPhone(phone);

    const dbPath = path.resolve(process.cwd(), "pulo.db");
    sqlite = new Database(dbPath);

    // Validate phone format (Vietnamese phone numbers)
    // 84 + 10 digits = 11 chars (standard mobile) or 84 + 11 digits =
    // 12 chars (rare longer formats). Keeping the same shape as the
    // send-otp endpoint so the two sides agree on what's valid.
    if (!/^84\d{9,10}$/.test(formattedPhone)) {
      return NextResponse.json(
        { error: "Số điện thoại không hợp lệ" },
        { status: 400 }
      , { headers: corsHeaders });
    }

    // Look up the OTP record
    const otpRecord = sqlite
      .prepare(
        "SELECT * FROM phone_otps WHERE phone = ? AND otp = ? AND expires_at > ? LIMIT 1"
      )
      .get(formattedPhone, otp, Math.floor(Date.now() / 1000)) as
      | { id: number; phone: string; otp: string }
      | undefined;

    if (!otpRecord) {
      return NextResponse.json(
        { error: "Mã OTP không hợp lệ hoặc đã hết hạn" },
        { status: 401 }
      , { headers: corsHeaders });
    }

    // IMPORTANT: do NOT burn the OTP here. The NextAuth phone
    // credentials provider's `authorize` callback runs immediately
    // after this returns (see signin/page.tsx `handleVerifyOtp`) and
    // re-checks the OTP to mint the session — burning here would
    // leave the second lookup empty and the user would see a
    // confusing "CredentialsSignin" error. The provider's authorize
    // is the single source of truth that burns the OTP on success.

    return NextResponse.json({
      success: true,
      message: "Mã OTP hợp lệ",
      phone: formattedPhone,
    }, { headers: corsHeaders });
  } catch (err) {
    console.error("[Verify OTP Error]", err);
    return NextResponse.json({ error: "Lỗi server" }, { status: 500 }, { headers: corsHeaders });
  } finally {
    sqlite?.close();
  }
}
