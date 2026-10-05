import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCallManager2 } from '@/lib/callManager2';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { conversationId, calleeId, calleeName, calleeAvatar, conversationName, isGroup } = body;

    if (!conversationId || !calleeId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const callManager = getCallManager2();

    // Check if caller already has an active call
    const activeCalls = await callManager.getUserActiveCalls(session.user.id);
    if (activeCalls.length > 0) {
      return NextResponse.json(
        { error: 'Already in a call' },
        { status: 409 }
      );
    }

    // Check if callee has an active call
    const calleeActiveCalls = await callManager.getUserActiveCalls(calleeId);
    if (calleeActiveCalls.length > 0) {
      return NextResponse.json(
        { error: 'User is busy' },
        { status: 409 }
      );
    }

    // Create call
    const call = await callManager.createCall({
      conversationId,
      callerId: session.user.id,
      callerName: session.user.name || 'Unknown',
      callerAvatar: session.user.image || undefined,
      calleeId,
      calleeName,
      calleeAvatar,
      conversationName,
      isGroup: isGroup || false,
    });

    return NextResponse.json({ call });
  } catch (error) {
    console.error('[API] Initiate call error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
