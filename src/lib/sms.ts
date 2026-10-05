/**
 * SMS helper — Twilio
 *
 * Gửi OTP qua Twilio. Nếu thiếu credentials hoặc gửi lỗi, fallback về
 * console.log để dev vẫn nhận được OTP trong terminal.
 */

type SendOtpParams = {
  phone: string;        // E.164 format, vd "84339033253"
  otp: string;          // 6 chữ số
  expiresInSeconds?: number;
};

type SendOtpResult = {
  ok: boolean;
  channel: "twilio" | "dev-log";
  messageSid?: string;
  error?: string;
};

function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
}

export async function sendOtpSms({
  phone,
  otp,
  expiresInSeconds = 300,
}: SendOtpParams): Promise<SendOtpResult> {
  const minutes = Math.max(1, Math.floor(expiresInSeconds / 60));
  // Twilio SMS uses GSM-7 (ASCII). Use English to keep it short and
  // avoid Unicode UCS-2 encoding that costs 3x the segments.
  const body = `[PuLo] Your verification code is: ${otp}. Valid ${minutes} min. Do not share it with anyone.`;

  // ── Dev fallback: nếu chưa cấu hình Twilio → chỉ log ──
  if (!isTwilioConfigured()) {
    console.warn(
      `[SMS] Twilio chua duoc cau hinh (thieu env). OTP=${otp} cho ${phone}`,
    );
    return { ok: true, channel: "dev-log" };
  }

  // ── Gửi qua Twilio ──
  try {
    // Lazy import để tránh load SDK khi không dùng
    const twilio = (await import("twilio")).default;
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );

    const msg = await client.messages.create({
      body,
      // Twilio cần on E.164 với dấu "+" đứng đầu.
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: `+${phone}`,
    });

    console.log(`[SMS] Twilio sent SID=${msg.sid} to +${phone}`);
    return { ok: true, channel: "twilio", messageSid: msg.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SMS] Twilio error for +${phone}:`, message);

    // Vẫn log OTP để dev test khi Twilio fail
    console.log(`[SMS] FALLBACK OTP=${otp} for +${phone}`);

    return { ok: false, channel: "twilio", error: message };
  }
}