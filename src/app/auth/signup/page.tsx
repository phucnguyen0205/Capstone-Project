"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

type SignupTab = "email" | "phone";

export default function SignUpPage() {
  const router = useRouter();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<SignupTab>("email");
  
  // Email signup state
  const [form, setForm] = useState({ email: "", username: "", name: "", password: "" });
  
  // Phone signup state
  const [phone, setPhone] = useState("");
  const [phoneName, setPhoneName] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
  // Common state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Handle email signup
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Đăng ký thất bại");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Tài khoản đã tạo nhưng đăng nhập thất bại. Hãy thử đăng nhập lại.");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  // Handle send OTP for phone registration
  async function handleSendOtp() {
    if (!phone) {
      setError("Vui lòng nhập số điện thoại");
      return;
    }
    
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Gửi mã OTP thất bại");
        setLoading(false);
        return;
      }

      setOtpSent(true);
      setStep("otp");
      setCountdown(300);

      blurActive();
      
      const timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(timer);
            return 0;
          }
          return c - 1;
        });
      }, 1000);

    } catch (err) {
      setError("Lỗi kết nối server");
    }
    
    setLoading(false);
  }

  // Handle verify OTP and complete phone registration
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // First verify the OTP
      const verifyRes = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error ?? "Mã OTP không hợp lệ");
        setLoading(false);
        return;
      }

      // OTP hợp lệ — tạo session qua NextAuth phone provider
      const result = await signIn("phone", {
        phone: verifyData.phone ?? phone,
        otp,
        redirect: false,
      });

      if (result?.error) {
        setError("Không tạo được phiên đăng nhập. Vui lòng thử lại.");
        setLoading(false);
        return;
      }

      // If OTP is valid, redirect to complete profile
      router.push("/auth/complete-profile");
      router.refresh();
    } catch (err) {
      setError("Lỗi kết nối server");
      setLoading(false);
    }
  }

  // Handle Google signup
  function handleGoogleSignup() {
    signIn("google", { callbackUrl: "/" });
  }

  // Format countdown
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  // Blur focused input before unmounts that swap the form contents.
  function blurActive() {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  // Resend OTP
  function handleResendOtp() {
    if (countdown > 0) return;
    setOtpSent(false);
    setStep("phone");
    setOtp("");
    handleSendOtp();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090a0c]">
      <div className="w-full max-w-[400px] rounded-3xl border border-[#242831] bg-[#111317] p-8">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[18px]"
            style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
          >
            <Icon name="zap" size={24} />
          </div>
          <h1 className="text-2xl font-extrabold text-white">Tạo tài khoản</h1>
          <p className="mt-2 text-sm text-[#a0a5b5]">Kết nối bạn bè, chia sẻ vibe!</p>
        </div>

        {/* Tab switcher */}
        <div className="mb-6 flex rounded-xl bg-[#171920] p-1">
          <button
            type="button"
            onClick={() => { blurActive(); setActiveTab("email"); setError(""); setStep("phone"); setOtpSent(false); }}
            className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-all ${
              activeTab === "email" 
                ? "bg-[#242831] text-white" 
                : "text-[#626775] hover:text-[#a0a5b5]"
            }`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => { blurActive(); setActiveTab("phone"); setError(""); setStep("phone"); setOtpSent(false); }}
            className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-all ${
              activeTab === "phone" 
                ? "bg-[#242831] text-white" 
                : "text-[#626775] hover:text-[#a0a5b5]"
            }`}
          >
            Số điện thoại
          </button>
        </div>

        {/* Email signup form */}
        {activeTab === "email" && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-[#a0a5b5]">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                placeholder="you@example.com"
                autoComplete="username"
                name="email"
                className="w-full rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-[#a0a5b5]">Tên đăng nhập</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
                placeholder="yourname"
                autoComplete="username"
                name="username"
                className="w-full rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-[#a0a5b5]">Tên hiển thị</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your Name (tùy chọn)"
                autoComplete="name"
                name="name"
                className="w-full rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-[#a0a5b5]">Mật khẩu</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
                placeholder="Tối thiểu 6 ký tự"
                autoComplete="new-password"
                name="password"
                className="w-full rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-50"
              style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
            >
              {loading ? "Đang đăng ký..." : "Tạo tài khoản"}
            </button>
          </form>
        )}

        {/* Phone signup form */}
        {activeTab === "phone" && (
          <>
            {step === "phone" ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-[#a0a5b5]">Số điện thoại</label>
                  <div className="flex gap-2">
                    <span className="flex items-center rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-[#626775]">
                      +84
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      required
                      placeholder="9xx xxx xxx"
                      autoComplete="tel-national"
                      name="phone"
                      inputMode="numeric"
                      className="flex-1 rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-[#a0a5b5]">Tên hiển thị (tùy chọn)</label>
                  <input
                    type="text"
                    value={phoneName}
                    onChange={(e) => setPhoneName(e.target.value)}
                    placeholder="Tên của bạn"
                    autoComplete="name"
                    name="name"
                    className="w-full rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93]"
                  />
                </div>

                {error && (
                  <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
                >
                  {loading ? "Đang gửi mã..." : "Gửi mã xác thực"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-[#a0a5b5]">Mã xác thực</label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder="Nhập 6 chữ số"
                    className="w-full rounded-xl border border-[#242831] bg-[#171920] px-4 py-3 text-[14px] text-white outline-none placeholder:text-[#626775] focus:border-[#ff2e93] text-center tracking-widest"
                  />
                  <p className="text-center text-[12px] text-[#626775]">
                    Mã OTP đã được gửi đến +84 {phone.slice(1)}
                  </p>
                </div>

                {error && (
                  <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-50"
                  style={{ backgroundImage: "linear-gradient(45deg, rgb(255, 46, 147) 25%, rgb(255, 138, 86) 75%)" }}
                >
                  {loading ? "Đang xác thực..." : "Xác thực và tạo tài khoản"}
                </button>

                <div className="flex items-center justify-between text-[13px]">
                  <button
                    type="button"
                    onClick={() => { blurActive(); setStep("phone"); setOtp(""); }}
                    className="text-[#a0a5b5] hover:text-white"
                  >
                    ← Đổi số điện thoại
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={countdown > 0}
                    className={`font-semibold ${countdown > 0 ? "text-[#626775]" : "text-[#ff2e93]"}`}
                  >
                    {countdown > 0 ? `Gửi lại sau ${formatTime(countdown)}` : "Gửi lại mã"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#242831]" />
          <span className="text-[12px] text-[#626775]">hoặc</span>
          <div className="h-px flex-1 bg-[#242831]" />
        </div>

        {/* Google signup button */}
        <button
          type="button"
          onClick={handleGoogleSignup}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#242831] bg-[#171920] py-3 text-[14px] font-semibold text-white transition-all hover:bg-[#1f2329]"
        >
          <svg className="size-5" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"
            />
            <path
              fill="#34A853"
              d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"
            />
            <path
              fill="#4A90E2"
              d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"
            />
            <path
              fill="#FBBC05"
              d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7 51.1631378,17.9636364 L5.27698177,14.2678769 Z"
            />
          </svg>
          Tiếp tục với Google
        </button>

        <p className="mt-6 text-center text-[13px] text-[#626775]">
          Đã có tài khoản?{" "}
          <Link href="/auth/signin" className="font-semibold text-[#ff2e93] hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
