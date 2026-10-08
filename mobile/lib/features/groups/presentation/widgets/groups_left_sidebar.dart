import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/group_member_model.dart';
import '../../../../core/models/group_tier_model.dart';

/// Left sidebar for groups page — shows tier counts (radar),
/// quick member avatars, "Trắc nghiệm" / "Ghi chép" buttons.
///
/// Mirrors `GroupsLeftSidebar` in web.
class GroupsLeftSidebar extends StatelessWidget {
  final List<GroupTierInfo> tiers;
  final List<GroupMemberModel> members;
  final VoidCallback onRadar;
  final VoidCallback onQuiz;
  final VoidCallback onDiary;

  const GroupsLeftSidebar({
    super.key,
    required this.tiers,
    required this.members,
    required this.onRadar,
    required this.onQuiz,
    required this.onDiary,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        _LensCard(tiers: tiers, onRadar: onRadar),
        const SizedBox(height: 12),
        _QuickAction(
          icon: LucideIcons.compass,
          label: 'Trắc nghiệm',
          color: const Color(0xFF06B6D4),
          onTap: onQuiz,
        ),
        const SizedBox(height: 8),
        _QuickAction(
          icon: LucideIcons.bookOpen,
          label: 'Ghi chép',
          color: const Color(0xFFFBBF24),
          onTap: onDiary,
        ),
        const SizedBox(height: 16),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text(
            'THÀNH VIÊN',
            style: TextStyle(
              color: Color(0xFF626775),
              fontSize: 10,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        if (members.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text(
              'Đang tải thành viên...',
              style: TextStyle(color: Color(0xFF626775), fontSize: 11),
            ),
          )
        else
          ...members.take(8).map((m) => _MemberRow(m: m)),
      ],
    );
  }
}

class _LensCard extends StatelessWidget {
  final List<GroupTierInfo> tiers;
  final VoidCallback onRadar;
  const _LensCard({required this.tiers, required this.onRadar});

  @override
  Widget build(BuildContext context) {
    final icons = <String, IconData>{
      'all': LucideIcons.layers,
      'public': LucideIcons.globe,
      'friends': LucideIcons.users,
      'close': LucideIcons.heartHandshake,
      'private': LucideIcons.lock,
    };
    final colors = <String, Color>{
      'all': const Color(0xFF8B5CF6),
      'public': const Color(0xFF06B6D4),
      'friends': const Color(0xFF34D399),
      'close': const Color(0xFFF472B6),
      'private': const Color(0xFFFBBF24),
    };
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF171920),
        border: Border.all(color: const Color(0xFF242831)),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.radar,
                  color: Color(0xFF8B5CF6), size: 14),
              const SizedBox(width: 6),
              const Text(
                'RADAR',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 11,
                ),
              ),
              const Spacer(),
              InkWell(
                onTap: onRadar,
                child: const Padding(
                  padding: EdgeInsets.all(2),
                  child: Icon(LucideIcons.arrowRight,
                      color: Color(0xFF626775), size: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...tiers.map((t) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Icon(
                      icons[t.key] ?? LucideIcons.circle,
                      size: 12,
                      color: colors[t.key] ?? const Color(0xFF626775),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        t.label,
                        style: const TextStyle(
                          color: Color(0xFFA0A5B5),
                          fontSize: 11,
                        ),
                      ),
                    ),
                    Text(
                      t.count.toString(),
                      style: const TextStyle(
                        color: Color(0xFF626775),
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.15),
          border: Border.all(color: color.withOpacity(0.4)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 14),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

class _MemberRow extends StatelessWidget {
  final GroupMemberModel m;
  const _MemberRow({required this.m});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            height: 28,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                    ),
                  ),
                  child: Center(
                    child: Text(
                      m.displayName.isNotEmpty
                          ? m.displayName[0].toUpperCase()
                          : '?',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                if (m.isOnline)
                  Positioned(
                    bottom: 0,
                    right: 0,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: const Color(0xFF34D399),
                        shape: BoxShape.circle,
                        border: Border.all(
                            color: const Color(0xFF171920), width: 1.5),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              m.displayName,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
