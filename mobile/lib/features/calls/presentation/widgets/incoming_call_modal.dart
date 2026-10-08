import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Incoming call overlay with ring animation + accept/decline.
///
/// Mirrors `IncomingCallModal.tsx` in web.
class IncomingCallModal extends StatefulWidget {
  final String callerName;
  final String? callerAvatar;
  final String conversationName;
  final bool isGroup;
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const IncomingCallModal({
    super.key,
    required this.callerName,
    this.callerAvatar,
    required this.conversationName,
    required this.isGroup,
    required this.onAccept,
    required this.onDecline,
  });

  @override
  State<IncomingCallModal> createState() => _IncomingCallModalState();
}

class _IncomingCallModalState extends State<IncomingCallModal>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(seconds: 2))
        ..repeat();

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final initial =
        widget.callerName.isNotEmpty ? widget.callerName[0].toUpperCase() : '?';
    return Material(
      color: Colors.black87,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (_, __) {
                  return Container(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        radius: 0.6 + (_pulse.value * 0.2),
                        colors: widget.isGroup
                            ? const [
                                Color(0xFF8B5CF6),
                                Colors.transparent,
                              ]
                            : const [
                                Color(0xFFFF2E93),
                                Colors.transparent,
                              ],
                      ),
                    ),
                  );
                },
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AnimatedBuilder(
                    animation: _pulse,
                    builder: (_, __) {
                      final scale = 1 + (_pulse.value * 0.08);
                      return Transform.scale(
                        scale: scale,
                        child: Container(
                          width: 140,
                          height: 140,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: widget.isGroup
                                ? const LinearGradient(
                                    colors: [
                                      Color(0xFF8B5CF6),
                                      Color(0xFF14B8A6)
                                    ],
                                  )
                                : const LinearGradient(
                                    colors: [
                                      Color(0xFFFF2E93),
                                      Color(0xFFFF8A56)
                                    ],
                                  ),
                          ),
                          child: widget.callerAvatar != null &&
                                  widget.callerAvatar!.isNotEmpty
                              ? ClipOval(
                                  child: Image.network(
                                    widget.callerAvatar!,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Center(
                                      child: Text(initial,
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 56,
                                              fontWeight: FontWeight.bold)),
                                    ),
                                  ),
                                )
                              : Center(
                                  child: Text(initial,
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 56,
                                          fontWeight: FontWeight.bold)),
                                ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 24),
                  Text(
                    widget.callerName,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Cuộc gọi ${widget.isGroup ? 'nhóm' : 'đến'} • ${widget.conversationName}',
                    style: const TextStyle(
                        color: Colors.white70, fontSize: 14),
                  ),
                  const SizedBox(height: 80),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _ActionButton(
                        label: 'Từ chối',
                        icon: LucideIcons.phoneOff,
                        gradient: const LinearGradient(
                          colors: [Color(0xFFEF4444), Color(0xFFF87171)],
                        ),
                        onTap: widget.onDecline,
                      ),
                      _ActionButton(
                        label: 'Chấp nhận',
                        icon: LucideIcons.phone,
                        gradient: const LinearGradient(
                          colors: [Color(0xFF34D399), Color(0xFF10B981)],
                        ),
                        onTap: widget.onAccept,
                      ),
                    ],
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

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Gradient gradient;
  final VoidCallback onTap;
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(36),
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: gradient,
            ),
            child: Icon(icon, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(height: 8),
        Text(label,
            style: const TextStyle(color: Colors.white, fontSize: 13)),
      ],
    );
  }
}
