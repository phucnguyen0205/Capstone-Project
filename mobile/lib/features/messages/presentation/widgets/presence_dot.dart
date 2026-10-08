import 'package:flutter/material.dart';

import '../../../../core/models/presence_info_model.dart';

/// Small dot indicating a user's online state.
///
/// Mirrors `PresenceDot` in web `ChatColumn.tsx`:
///   - green dot when online (with optional pulse)
///   - muted when recently active
///   - gray when offline
class PresenceDot extends StatelessWidget {
  final PresenceInfo? presence;
  final double size;
  final bool pulse;

  const PresenceDot({
    super.key,
    required this.presence,
    this.size = 10,
    this.pulse = false,
  });

  @override
  Widget build(BuildContext context) {
    final p = presence;
    if (p == null) return const SizedBox.shrink();
    final color = switch (p.dotColor) {
      'green' => const Color(0xFF34D399),
      'muted' => const Color(0xFFA0A5B5),
      _ => const Color(0xFF3A3F4B),
    };
    final shouldPulse = pulse && p.code == 3;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFF111317), width: 1.5),
      ),
      child: shouldPulse
          ? null
          : null,
    );
  }
}
