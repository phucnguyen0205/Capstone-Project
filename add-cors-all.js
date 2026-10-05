const fs = require('fs');
const path = require('path');

const CORS_CODE = `import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders });
}
`;

const routesDir = path.join(__dirname, 'src/app/api');

// Get all route.ts files recursively
function getRouteFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getRouteFiles(fullPath));
    } else if (entry.name === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

const routes = getRouteFiles(routesDir);

for (const route of routes) {
  let content = fs.readFileSync(route, 'utf8');
  
  // Skip if already has CORS
  if (content.includes('corsHeaders')) {
    console.log('SKIP: ' + route);
    continue;
  }
  
  // Add import for corsHeaders if not present
  if (!content.includes('import { corsHeaders }')) {
    content = "import { corsHeaders } from \"@/lib/cors\";\n" + content;
  }
  
  // Find the first export and add OPTIONS before it
  const exportMatch = content.match(/^export async function \w+/m);
  if (exportMatch) {
    const pos = content.indexOf(exportMatch[0]);
    content = content.slice(0, pos) + CORS_CODE + '\n' + content.slice(pos);
  }
  
  // Add headers to all NextResponse.json calls
  content = content.replace(
    /NextResponse\.json\(([^)]+)\)/g,
    (match, params) => {
      // Don't add if already has headers
      if (params.includes('headers:')) return match;
      // Check if it's a simple json call without second param
      if (!params.includes('{')) return match;
      return `NextResponse.json(${params}, { headers: corsHeaders })`;
    }
  );
  
  fs.writeFileSync(route, content);
  console.log('UPDATED: ' + route);
}

console.log('\nDone! Restart the Next.js server to apply changes.');
