import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/widgets/safe_avatar.dart';

/// Stacked avatar used for group conversations. Shows up to 3 small
/// overlapping participant avatars over a gradient users-icon background.
///
/// Mirrors `GroupAvatar` in web `ChatColumn.tsx`.
class GroupAvatar extends StatelessWidget {
  final List<UserModel> participants;
  final String? groupName;
  final double size;

  const GroupAvatar({
    super.key,
    required this.participants,
    this.groupName,
    this.size = 44,
  });

  @override
  Widget build(BuildContext context) {
    final slice = participants.take(3).toList();
    final half = (size / 2).round();
    final offsets = <Offset>[
      Offset.zero,
      Offset(half.toDouble(), half.toDouble()),
      Offset(half.toDouble(), 0),
    ];

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
              ),
            ),
            child: Icon(
              LucideIcons.users2,
              color: Colors.white,
              size: (size * 0.5).roundToDouble(),
            ),
          ),
          ...List.generate(slice.length, (i) {
            final p = slice[i];
            return Positioned(
              top: offsets[i].dy,
              left: offsets[i].dx,
              child: _MiniAvatar(
                avatar: p.avatar,
                name: p.name,
                size: 24,
              ),
            );
          }),
        ],
      ),
    );
  }
}

class _MiniAvatar extends StatelessWidget {
  final String? avatar;
  final String? name;
  final double size;
  const _MiniAvatar({this.avatar, this.name, this.size = 24});

  @override
  Widget build(BuildContext context) {
    final initial = (name == null || name!.isEmpty) ? '?' : name![0].toUpperCase();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFF111317), width: 2),
        color: const Color(0xFF2A2D37),
      ),
      child: ClipOval(
        child: avatar != null && avatar!.isNotEmpty
            ? SafeAvatar(
                imageUrl: avatar,
                name: name,
                size: size,
              )
            : _InitialFallback(initial: initial),
      ),
    );
  }
}

class _InitialFallback extends StatelessWidget {
  final String initial;
  const _InitialFallback({required this.initial});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 9,
        ),
      ),
    );
  }
}
