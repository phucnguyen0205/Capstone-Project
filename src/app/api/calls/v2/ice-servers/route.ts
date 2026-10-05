import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getIceServers } from '@/lib/iceServers';

// Route này phụ thuộc session/headers (cookie) → không thể prerender
// tĩnh. Buộc chạy ở runtime để Next.js không cố generate HTML tĩnh.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const iceServers = await getIceServers();

    return NextResponse.json({ iceServers });
  } catch (error) {
    console.error('[API] Get ICE servers error:', error);
    
    // Fallback to basic STUN servers
    return NextResponse.json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });
  }
}
