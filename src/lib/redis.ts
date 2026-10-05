import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;

export function getRedisClient() {
  if (!client) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('[Redis] Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    client.on('error', (err) => {
      console.error('[Redis] Error:', err);
    });

    client.on('connect', () => {
      console.log('[Redis] Connected');
    });

    client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    client.on('ready', () => {
      console.log('[Redis] Ready');
    });

    // Connect immediately
    client.connect().catch((err) => {
      console.error('[Redis] Failed to connect:', err);
      // Fall back to in-memory mode for development
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Redis] Running without Redis in development mode');
      }
    });
  }

  return client;
}

export async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}
