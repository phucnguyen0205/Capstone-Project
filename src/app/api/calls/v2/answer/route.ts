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
    const { callId, action } = body;

    if (!callId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    switch (action) {
      case 'accept':
        // Only callee can accept
        if (call.calleeId !== session.user.id) {
          return NextResponse.json(
            { error: 'Only callee can accept' },
            { status: 403 }
          );
        }
        const acceptedCall = await callManager.acceptCall(callId);
        return NextResponse.json({ call: acceptedCall });

      case 'decline':
        // Only callee can decline
        if (call.calleeId !== session.user.id) {
          return NextResponse.json(
            { error: 'Only callee can decline' },
            { status: 403 }
          );
        }
        await callManager.declineCall(callId);
        return NextResponse.json({ success: true });

      case 'end':
        // Either participant can end
        await callManager.endCall(callId, 'ended');
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[API] Answer call error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
