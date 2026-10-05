#!/bin/bash
# Restart Next.js server with CORS fix

# Find and kill any existing Next.js processes
echo "Stopping existing Next.js processes..."
pkill -f "next dev" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

echo "Starting Next.js server..."
cd "$(dirname "$0")"
npm run dev
