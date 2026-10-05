import { corsHeaders } from "@/lib/cors";
import { NextRequest, NextResponse } from "next/server";

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    { message: 'OK' },
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}

// Redirect root to nothing
export async function GET() {
  return NextResponse.json({ message: 'API Root' }, { headers: corsHeaders });
}
