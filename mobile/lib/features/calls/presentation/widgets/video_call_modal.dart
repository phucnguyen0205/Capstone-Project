import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/incoming_call_model.dart';
import '../providers/call_providers.dart';
import 'incoming_call_modal.dart';

/// Full-screen outgoing video/voice call modal.
///
/// Mirrors `VideoCallModal.tsx` in web. Shows:
/// - local camera preview (top right pip)
/// - remote placeholder (avatar) in main area
/// - call duration timer
/// - mic / camera / end / invite controls
class VideoCallModal extends ConsumerStatefulWidget {
  final bool videoOn;
  final String conversationName;
  final String? calleeName;
  final String? calleeAvatar;
  final bool isGroup;
  final VoidCallback? onClose;

  const VideoCallModal({
    super.key,
    required this.videoOn,
    required this.conversationName,
    this.calleeName,
    this.calleeAvatar,
    required this.isGroup,
    this.onClose,
  });

  @override
  ConsumerState<VideoCallModal> createState() => _VideoCallModalState();
}

class _VideoCallModalState extends ConsumerState<VideoCallModal> {
  bool _micOn = true;
  bool _camOn = true;
  Duration _elapsed = Duration.zero;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _elapsed += const Duration(seconds: 1));
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _toggleMic() async {
    final rtc = ref.read(webRtcServiceProvider);
    await rtc.toggleMic();
    setState(() => _micOn = rtc.micOn);
  }

  Future<void> _toggleCam() async {
    final rtc = ref.read(webRtcServiceProvider);
    await rtc.toggleCamera();
    setState(() => _camOn = rtc.cameraOn);
  }

  Future<void> _endCall() async {
    final notifier = ref.read(callProvider.notifier);
    await notifier.endCall();
    widget.onClose?.call();
  }

  @override
  Widget build(BuildContext context) {
    final rtc = ref.watch(webRtcServiceProvider);
    final localRenderer = rtc.localRenderer;
    final remoteRenderer = rtc.remoteRenderer;
    final hasRemoteStream = remoteRenderer.srcObject != null;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Remote video (full screen) or placeholder
            if (hasRemoteStream)
              RTCVideoView(remoteRenderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
            else
              _RemotePlaceholder(
                calleeName: widget.calleeName ?? widget.conversationName,
                avatar: widget.calleeAvatar,
                isGroup: widget.isGroup,
              ),
            // Local video PIP
            Positioned(
              top: 16,
              right: 16,
              child: Container(
                width: 120,
                height: 160,
                decoration: BoxDecoration(
                  color: const Color(0xFF111317),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white24),
                ),
                clipBehavior: Clip.antiAlias,
                child: rtc.isInitialized && widget.videoOn
                    ? RTCVideoView(localRenderer, mirror: true)
                    : Container(
                        color: Colors.black54,
                        child: const Center(
                          child: Icon(LucideIcons.videoOff,
                              color: Colors.white60, size: 24),
                        ),
                      ),
              ),
            ),
            // Top bar with caller info + timer
            Positioned(
              top: 16,
              left: 16,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.6),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: widget.isGroup
                            ? const Color(0xFF34D399)
                            : const Color(0xFFFF2E93),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      widget.isGroup
                          ? widget.conversationName
                          : (widget.calleeName ?? 'Đang gọi...'),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 8),
                    Text(_format(_elapsed),
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 11)),
                  ],
                ),
              ),
            ),
            // Bottom controls
            Positioned(
              left: 0,
              right: 0,
              bottom: 24,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _CircleButton(
                    icon: _micOn
                        ? LucideIcons.mic
                        : LucideIcons.micOff,
                    active: _micOn,
                    onTap: _toggleMic,
                  ),
                  _CircleButton(
                    icon: LucideIcons.phoneOff,
                    active: false,
                    gradient: const LinearGradient(
                      colors: [Color(0xFFEF4444), Color(0xFFF87171)],
                    ),
                    onTap: _endCall,
                    large: true,
                  ),
                  _CircleButton(
                    icon: _camOn
                        ? LucideIcons.video
                        : LucideIcons.videoOff,
                    active: _camOn,
                    onTap: _toggleCam,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _format(Duration d) {
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

class _RemotePlaceholder extends ConsumerWidget {
  final String calleeName;
  final String? avatar;
  final bool isGroup;
  const _RemotePlaceholder({
    required this.calleeName,
    required this.avatar,
    required this.isGroup,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rtc = ref.watch(webRtcServiceProvider);
    final status = rtc.connectionState;
    final initial =
        calleeName.isNotEmpty ? calleeName[0].toUpperCase() : '?';
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1F2028), Color(0xFF0C0C14)],
        ),
      ),
      child: Center(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: isGroup
                    ? const LinearGradient(
                        colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
                      )
                    : const LinearGradient(
                        colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                      ),
              ),
              child: avatar != null && avatar!.isNotEmpty
                  ? ClipOval(
                      child: Image.network(
                        avatar!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Center(
                          child: Text(initial,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 36,
                                  fontWeight: FontWeight.bold)),
                        ),
                      ),
                    )
                  : Center(
                      child: Text(initial,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 36,
                              fontWeight: FontWeight.bold)),
                    ),
            ),
            const SizedBox(height: 16),
            Text(
              calleeName,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              status == 'connected' ? 'Đã kết nối' : 'Đang kết nối...',
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
        ),
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final bool active;
  final VoidCallback onTap;
  final Gradient? gradient;
  final bool large;
  const _CircleButton({
    required this.icon,
    required this.active,
    required this.onTap,
    this.gradient,
    this.large = false,
  });

  @override
  Widget build(BuildContext context) {
    final size = large ? 60.0 : 50.0;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(size),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: gradient == null
              ? (active ? const Color(0xFF2A2D37) : const Color(0xFF6B7280))
              : null,
          gradient: gradient,
        ),
        child: Icon(icon, color: Colors.white, size: large ? 28 : 22),
      ),
    );
  }
}

/// Root overlay widget listening to call state. Renders
/// `IncomingCallModal` and `VideoCallModal` based on state. Place
/// once inside `MaterialApp.builder`.
class CallOverlay extends ConsumerStatefulWidget {
  final Widget child;
  const CallOverlay({super.key, required this.child});

  @override
  ConsumerState<CallOverlay> createState() => _CallOverlayState();
}

class _CallOverlayState extends ConsumerState<CallOverlay> {
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
    // Determine whether this is a video call. An outgoing call always
    // tries video (caller intent). For incoming calls we peek at the
    // incoming payload — `isVideo` field if present, otherwise fall
    // back to the outgoing flag for the case the same overlay opens.
    final isVideo = state.outgoingCalleeId != null ||
        (state.incomingCall?.isVideo ?? true);
    final callId = state.activeCallId ?? 'unknown';
    final isCaller = state.outgoingCalleeId != null;
    final err = await rtc.start(
      callId: callId,
      isCaller: isCaller,
      video: isVideo,
      audio: true,
    );
    if (!mounted) return;
    setState(() {
      _rtcReady = err == null;
      _rtcError = err;
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(callProvider);

    return Stack(
      children: [
        widget.child,
        if (state.status == CallStatus.ringing && state.incomingCall != null)
          _IncomingCallOverlay(incoming: state.incomingCall!),
        if (state.status == CallStatus.connecting ||
            state.status == CallStatus.connected)
          _VideoCallOverlay(
            state: state,
            rtcReady: _rtcReady,
            rtcError: _rtcError,
          ),
      ],
    );
  }
}

class _IncomingCallOverlay extends ConsumerWidget {
  final IncomingCallModel incoming;
  const _IncomingCallOverlay({required this.incoming});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IncomingCallModal(
      callerName: incoming.callerName,
      callerAvatar: incoming.callerAvatar,
      conversationName: incoming.conversationName,
      isGroup: incoming.isGroup,
      onAccept: () =>
          ref.read(callProvider.notifier).accept(callId: incoming.id),
      onDecline: () =>
          ref.read(callProvider.notifier).decline(callId: incoming.id),
    );
  }
}

class _VideoCallOverlay extends ConsumerWidget {
  final CallState state;
  final bool rtcReady;
  final String? rtcError;
  const _VideoCallOverlay({
    required this.state,
    required this.rtcReady,
    required this.rtcError,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(callProvider.notifier);
    return VideoCallModal(
      videoOn: state.outgoingCalleeId != null,
      conversationName: state.outgoingConversationName ?? 'Cuộc gọi',
      calleeName: state.outgoingCalleeName,
      calleeAvatar: state.outgoingCalleeAvatar,
      isGroup: state.outgoingIsGroup,
      onClose: () async {
        await notifier.endCall();
      },
    );
  }
}
