import { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export function getSession() {
  return getServerSession(authOptions);
}

/**
 * Like `getSession`, but also accepts an `Authorization: Bearer <jwt>`
 * header. This lets the Flutter mobile client authenticate without
 * relying on cross-origin cookies, which the browser does not send.
 */
export async function getSessionFromRequest(request: NextRequest | Request) {
  if (!request) {
    // Defensive fallback — if a route forgot to forward the request, fall
    // back to the cookie-based session so we don't 500 silently.
    return getServerSession(authOptions);
  }
  // Try Bearer header first (mobile/web clients)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const secret =
          process.env.NEXTAUTH_SECRET ??
          process.env.AUTH_SECRET ??
          "dev-secret-do-not-use-in-prod";
        const decoded = await decode({ token, secret });
        if (decoded?.id) {
          return {
            user: {
              id: decoded.id as string,
              email: (decoded.email as string | null) ?? null,
              name: (decoded.name as string | null) ?? null,
              username: (decoded.username as string | null) ?? null,
              image: (decoded.image as string | null) ?? null,
              avatar: (decoded.image as string | null) ?? null,
            },
          } as Awaited<ReturnType<typeof getServerSession>>;
        }
      } catch {
        // Fall through to cookie-based session
      }
    }
  }

  // Fallback: cookie-based session (web client)
  return getServerSession(authOptions);
}

export async function getCurrentUser(request?: NextRequest | Request) {
  const session = request ? await getSessionFromRequest(request) : await getSession();
  if (!session?.user) return null;
  return session.user as {
    id: string;
    email: string;
    name?: string | null;
    username: string;
    image?: string | null;
  };
}
