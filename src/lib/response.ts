import { NextResponse } from "next/server";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token',
  'Access-Control-Allow-Credentials': 'true',
};

export function jsonResponse(body: unknown, init?: { status?: number }) {
  const response = NextResponse.json(body, init);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
  return response;
}
