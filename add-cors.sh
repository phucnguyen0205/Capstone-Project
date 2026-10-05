#!/bin/bash
# Add CORS headers to all API routes

CORS_IMPORT="const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}
"

FILES=(
  "src/app/api/feed/route.ts"
  "src/app/api/friend-request/route.ts"
  "src/app/api/interactions/route.ts"
  "src/app/api/ai/discover/route.ts"
  "src/app/api/ai/moderate/route.ts"
  "src/app/api/auth/send-otp/route.ts"
  "src/app/api/auth/verify-otp/route.ts"
  "src/app/api/auth/register/route.ts"
  "src/app/api/groups/activity/route.ts"
  "src/app/api/groups/members/route.ts"
  "src/app/api/groups/tiers/route.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Check if CORS already added
    if ! grep -q "corsHeaders" "$file"; then
      # Add import for NextResponse if needed
      if ! grep -q "import.*from.*next/server" "$file"; then
        sed -i '' '1i\import { NextRequest, NextResponse } from "next/server";' "$file"
      fi
      
      # Add CORS headers after imports (before first function)
      sed -i '' "/^export async function GET/i\\
$CORS_IMPORT\\
" "$file"
      
      echo "Updated: $file"
    else
      echo "Skipped (already has CORS): $file"
    fi
  fi
done
