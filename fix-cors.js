const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'src/app/api');

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
  
  // Skip if no duplicate issues
  if (!content.includes('defined multiple times')) continue;
  
  // Fix duplicate NextResponse imports - keep only the first one
  const lines = content.split('\n');
  const seenImports = new Set();
  const newLines = [];
  
  for (const line of lines) {
    // Check if this is a duplicate import
    if (line.match(/^import\s*{[^}]*}\s*from\s*["']next\/server["']/)) {
      if (seenImports.has('next/server')) {
        // Skip this duplicate
        continue;
      }
      seenImports.add('next/server');
    }
    
    if (line.match(/^import\s*{[^}]*}\s*from\s*["']@\/lib\/cors["']/)) {
      if (seenImports.has('@/lib/cors')) {
        // Skip this duplicate
        continue;
      }
      seenImports.add('@/lib/cors');
    }
    
    newLines.push(line);
  }
  
  content = newLines.join('\n');
  
  // Also remove the duplicated OPTIONS function if present
  const optionsMatches = content.match(/export async function OPTIONS\(\)[\s\S]*?\n\}\n/g);
  if (optionsMatches && optionsMatches.length > 1) {
    // Keep only the first OPTIONS
    const firstIndex = content.indexOf('export async function OPTIONS()');
    const lastIndex = content.lastIndexOf('export async function OPTIONS()');
    
    if (firstIndex !== lastIndex) {
      // Find the end of the last OPTIONS function
      const lastStart = content.lastIndexOf('export async function OPTIONS()');
      const afterLast = content.indexOf('\nexport', lastStart + 1);
      
      if (afterLast > lastStart) {
        content = content.slice(0, lastStart) + content.slice(afterLast);
      }
    }
  }
  
  fs.writeFileSync(route, content);
  console.log('FIXED: ' + route);
}

console.log('\nDone! Restart the Next.js server.');
