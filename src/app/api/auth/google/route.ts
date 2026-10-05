import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";


export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  // Get session to check if user is already logged in
  const session = await getSessionFromRequest(req);
  
  if (session) {
    // User is already logged in, redirect to callbackUrl
    return NextResponse.redirect(new URL(callbackUrl, req.url));
  }

  // Redirect to NextAuth Google sign-in
  return NextResponse.redirect(
    new URL(`/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url)
  );
}
