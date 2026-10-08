import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/services/webrtc_service.dart';
import '../providers/call_providers.dart';
import '../widgets/video_call_modal.dart';

/// Standalone route for /call/:callId — wraps `VideoCallModal` with a
/// fallback for when the call is started via deep link / notification.
///
/// Most of the time the overlay in `CallOverlay` handles the UI. This
/// page exists for direct navigation.
class CallPage extends ConsumerStatefulWidget {
  final String callId;
  const CallPage({super.key, required this.callId});

  @override
  ConsumerState<CallPage> createState() => _CallPageState();
}

class _CallPageState extends ConsumerState<CallPage> {
  bool _rtcReady = false;
  String? _rtcError;

  @override
  void initState() {
    super.initState();
    _startLocalMedia();
  }

  Future<void> _startLocalMedia() async {
    final rtc = ref.read(webRtcServiceProvider);
    final state = ref.read(callProvider);
    final isCaller = state.outgoingCalleeId != null;
    final err = await rtc.start(
      callId: widget.callId,
      isCaller: isCaller,
      video: true,
      audio: true,
    );
    if (!mounted) return;
    setState(() {
      _rtcReady = err == null;
      _rtcError = err;
    });
  }

  @override
  void dispose() {
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(callProvider);
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            if (state.status == CallStatus.connecting ||
                state.status == CallStatus.connected)
              VideoCallModal(
                videoOn: true,
                conversationName: state.outgoingConversationName ??
                    widget.callId,
                calleeName: state.outgoingCalleeName,
                calleeAvatar: state.outgoingCalleeAvatar,
                isGroup: state.outgoingIsGroup,
                onClose: () {
                  if (context.canPop()) {
                    context.pop();
                  }
                },
              )
            else
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(LucideIcons.phone,
                        color: Colors.white, size: 48),
                    const SizedBox(height: 12),
                    const Text(
                      'Đang kết nối cuộc gọi...',
                      style: TextStyle(color: Colors.white, fontSize: 16),
                    ),
                    if (_rtcError != null) ...[
                      const SizedBox(height: 8),
                      Text(_rtcError!,
                          style: const TextStyle(
                              color: Colors.red, fontSize: 12)),
                    ],
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: () {
                        ref.read(callProvider.notifier).endCall();
                        if (context.canPop()) {
                          context.pop();
                        }
                      },
                      icon: const Icon(LucideIcons.x,
                          color: Colors.white, size: 16),
                      label: const Text('Đóng',
                          style: TextStyle(color: Colors.white)),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Helper so we can read [WebRtcService] in tests.
typedef RtcServiceFactory = WebRtcService Function();
