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
    const { callId } = body;

    if (!callId) {
      return NextResponse.json(
        { error: 'Missing callId' },
        { status: 400 }
      );
    }

    const callManager = getCallManager2();
    const call = await callManager.getCall(callId);

    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // Verify user is part of this call
    if (call.callerId !== session.user.id && call.calleeId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Mark call as connected (WebRTC established)
    const updatedCall = await callManager.markConnected(callId);

    return NextResponse.json({ call: updatedCall });
  } catch (error) {
    console.error('[API] Mark connected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
