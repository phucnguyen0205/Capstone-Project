// CORS helper for API routes

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  // Include cache-control so SSE (text/event-stream) preflight from
  // browsers that auto-add the header doesn't get blocked.
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Requested-With, Cache-Control, Pragma',
  'Access-Control-Expose-Headers':
    'Content-Type, Authorization, X-Requested-With, Cache-Control',
};

export function addCorsHeaders(response) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
