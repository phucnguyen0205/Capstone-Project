import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";

// Hàm tạo CUID đơn giản
function generateId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `c_${timestamp}${randomPart}`;
}

// Normalise a Vietnamese phone number to the canonical `84xxxxxxxxx`
// form (no leading `+`, no spaces). Mirrors the same helper used by
// /api/auth/send-otp so the OTP lookup in the phone provider's
// authorize() finds rows written by the send endpoint. Accepts
// `0912345678`, `84912345678`, `+84 912 345 678`, etc.
function formatPhoneVN(phone: string): string {
  let formatted = phone.replace(/\D/g, "");
  if (formatted.startsWith("0")) formatted = "84" + formatted.slice(1);
  if (!formatted.startsWith("84")) formatted = "84" + formatted;
  return formatted;
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Provider đăng nhập bằng credentials (email/password)
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const dbPath = path.resolve(process.cwd(), "pulo.db");
        const sqlite = new Database(dbPath);

        try {
          const user = sqlite
            .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
            .get(credentials.email) as any;

          if (!user) return null;

          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username,
            image: user.avatar,
          };
        } finally {
          sqlite.close();
        }
      },
    }),
    // Provider đăng nhập bằng phone (OTP)
    CredentialsProvider({
      id: "phone",
      name: "phone",
      credentials: {
        phone: { label: "Phone", type: "text" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.phone || !credentials?.otp) return null;

        // Normalise to the same shape `/api/auth/send-otp` writes to
        // the `phone_otps` table (`84xxxxxxxxx`). Without this the
        // lookup would compare `0912345678` against the stored
        // `84912345678` and silently return null, surfacing as a
        // generic "CredentialsSignin" error to the user.
        const formattedPhone = formatPhoneVN(credentials.phone);
        if (!/^84\d{9,10}$/.test(formattedPhone)) return null;

        const dbPath = path.resolve(process.cwd(), "pulo.db");
        const sqlite = new Database(dbPath);

        try {
          // Verify OTP against the formatted phone
          const otpRecord = sqlite
            .prepare("SELECT * FROM phone_otps WHERE phone = ? AND otp = ? AND expires_at > ? LIMIT 1")
            .get(formattedPhone, credentials.otp, Math.floor(Date.now() / 1000)) as any;

          if (!otpRecord) return null;

          // Delete used OTP
          sqlite.prepare("DELETE FROM phone_otps WHERE phone = ?").run(formattedPhone);

          // Find or create user by phone
          let user = sqlite.prepare("SELECT * FROM users WHERE phone = ? LIMIT 1").get(formattedPhone) as any;

          if (!user) {
            // Create new user with phone
            const now = Math.floor(Date.now() / 1000);
            const userId = generateId();
            const username = `user_${formattedPhone.slice(-8)}`;
            // `users.email` is NOT NULL in the schema, so phone-only
            // signups need a placeholder address. Formatting as
            // `phone-{id}@phone.pulo.app` keeps it greppable, unique,
            // and clearly distinct from real user emails. Future
            // "link email" flows can replace it.
            const placeholderEmail = `phone-${userId}@phone.pulo.app`;

            sqlite
              .prepare(
                "INSERT INTO users (id, email, username, password, name, phone, provider, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)"
              )
              .run(userId, placeholderEmail, username, "PHONE_AUTH", formattedPhone.slice(-4), formattedPhone, "phone", now, now);

            user = { id: userId, username, name: formattedPhone.slice(-4), phone: formattedPhone, avatar: null };
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username,
            image: user.avatar,
          };
        } finally {
          sqlite.close();
        }
      },
    }),
    // Google OAuth Provider
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile) {
        const googleProfile = profile as any;
        const dbPath = path.resolve(process.cwd(), "pulo.db");
        const sqlite = new Database(dbPath);

        try {
          // Check if user exists by email
          let dbUser = sqlite
            .prepare("SELECT * FROM users WHERE email = ? LIMIT 1")
            .get(user.email) as any;

          if (!dbUser) {
            // Create new user with Google
            const now = Math.floor(Date.now() / 1000);
            const userId = generateId();
            const username = `user_${googleProfile.sub?.slice(-8) || Math.random().toString(36).slice(-8)}`;

            sqlite
              .prepare(
                "INSERT INTO users (id, email, username, password, name, avatar, provider, google_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
              )
              .run(userId, user.email, username, "GOOGLE_AUTH", user.name ?? "Google User", user.image, "google", googleProfile.sub, now, now);

            dbUser = { id: userId, username, name: user.name };
          }

          // Update user with Google info
          if (!dbUser.google_id) {
            sqlite
              .prepare("UPDATE users SET google_id = ?, provider = 'google', avatar = COALESCE(avatar, ?) WHERE id = ?")
              .run(googleProfile.sub, user.image, dbUser.id);
          }

          user.id = dbUser.id;
          user.username = dbUser.username;
        } finally {
          sqlite.close();
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // First sign-in: persist id + image + username on the JWT.
      if (account?.provider === "google" && user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.image = user.image;
        token.name = user.name;
      } else if (user) {
        token.id = user.id;
        token.username = (user as any).username;
        token.image = (user as any).image ?? (user as any).avatar ?? null;
        token.name = user.name;
      }
      // Subsequent calls: if we have an id but no image (e.g. the user
      // changed their avatar after signing in, or this is an old JWT issued
      // before this callback stored the image), re-fetch from the DB so
      // the navbar/topbar/etc. always show the latest avatar. We must use
      // the already-imported static modules — re-importing them inside the
      // callback breaks Edge bundling.
      if (token.id && !token.image) {
        try {
          const dbPath = path.resolve(process.cwd(), "pulo.db");
          const sqlite = new Database(dbPath);
          try {
            const row = sqlite
              .prepare("SELECT avatar FROM users WHERE id = ? LIMIT 1")
              .get(token.id) as { avatar?: string | null } | undefined;
            if (row?.avatar) token.image = row.avatar;
          } finally {
            sqlite.close();
          }
        } catch {
          // ignore — the user will simply fall back to initials
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).username = token.username;
        // Forward avatar/image so client components can render the avatar
        // directly from the session without an extra fetch.
        (session.user as any).image = (token as any).image ?? null;
        (session.user as any).avatar = (token as any).image ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
};
