import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/group_activity_model.dart';
import '../../../../core/models/group_member_model.dart';
import '../../../../core/providers/groups_providers.dart';
import '../../../../core/widgets/safe_image.dart';

/// Right sidebar for groups page — recent gallery grid + activity
/// feed + invisible-mirror toggle.
///
/// Mirrors `GroupsRightSidebar` in web.
class GroupsRightSidebar extends StatelessWidget {
  final List<RecentGalleryItem> recentGallery;
  final List<GroupActivityModel> activity;
  final List<GroupMemberModel> newMembers;
  final bool invisibleMirror;
  final void Function(bool) onInvisibleMirror;

  const GroupsRightSidebar({
    super.key,
    required this.recentGallery,
    required this.activity,
    required this.newMembers,
    required this.invisibleMirror,
    required this.onInvisibleMirror,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const _SectionTitle(label: 'THÀNH VIÊN MỚI'),
        SizedBox(
          height: 70,
          child: newMembers.isEmpty
              ? const Center(
                  child: Text(
                    'Đang tải...',
                    style: TextStyle(color: Color(0xFF626775), fontSize: 11),
                  ),
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: newMembers.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, i) =>
                      _MiniAvatar(name: newMembers[i].displayName),
                ),
        ),
        const SizedBox(height: 16),
        const _SectionTitle(label: 'HOẠT ĐỘNG GẦN ĐÂY'),
        if (activity.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('Chưa có hoạt động nào gần đây',
                style: TextStyle(color: Color(0xFF626775), fontSize: 11)),
          )
        else
          ...activity.take(8).map((a) => _ActivityRow(item: a)),
        const SizedBox(height: 16),
        const _SectionTitle(label: 'THƯ VIỆN GẦN ĐÂY'),
        if (recentGallery.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('Chưa có ảnh nào',
                style: TextStyle(color: Color(0xFF626775), fontSize: 11)),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate:
                const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              childAspectRatio: 1,
            ),
            itemCount: recentGallery.length,
            itemBuilder: (_, i) {
              final item = recentGallery[i];
              // Skip placeholder URLs (e.g. example.com in seed data) so
              // the UI shows the fallback icon instead of a 404 CORS error.
              if (isPlaceholderUrl(item.mediaUrl)) {
                return ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    color: const Color(0xFF1A1D24),
                    child: const Center(
                      child: Icon(
                          LucideIcons.imageOff,
                          color: Color(0xFF626775),
                          size: 16),
                    ),
                  ),
                );
              }
              return Stack(
                fit: StackFit.expand,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: CachedNetworkImage(
                      imageUrl: item.mediaUrl,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => const Icon(
                          LucideIcons.imageOff,
                          color: Color(0xFF626775),
                          size: 16),
                    ),
                  ),
                  if (item.isPrivate)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Icon(LucideIcons.lock,
                            color: Color(0xFFFBBF24), size: 10),
                      ),
                    ),
                ],
              );
            },
          ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFF171920),
            border: Border.all(color: const Color(0xFF242831)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(LucideIcons.eye,
                  color: Color(0xFF8B5CF6), size: 16),
              const SizedBox(width: 8),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Gương vô hình',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600)),
                    Text(
                      'Đăng bài nhưng không hiện lên bảng tin của tôi',
                      style: TextStyle(
                          color: Color(0xFF626775), fontSize: 10),
                    ),
                  ],
                ),
              ),
              Switch(
                value: invisibleMirror,
                onChanged: onInvisibleMirror,
                activeColor: const Color(0xFF8B5CF6),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String label;
  const _SectionTitle({required this.label});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 6),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF626775),
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _MiniAvatar extends StatelessWidget {
  final String name;
  const _MiniAvatar({required this.name});
  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
            ),
          ),
          child: Center(
            child: Text(
              name.isNotEmpty ? name[0].toUpperCase() : '?',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14),
            ),
          ),
        ),
        const SizedBox(height: 2),
        SizedBox(
          width: 48,
          child: Text(
            name,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFA0A5B5), fontSize: 9),
          ),
        ),
      ],
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final GroupActivityModel item;
  const _ActivityRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final icon = switch (item.type) {
      GroupActivityType.like => LucideIcons.heart,
      GroupActivityType.comment => LucideIcons.messageCircle,
      GroupActivityType.join => LucideIcons.userPlus,
      _ => LucideIcons.bell,
    };
    final color = switch (item.type) {
      GroupActivityType.like => const Color(0xFFFF2E93),
      GroupActivityType.comment => const Color(0xFF06B6D4),
      GroupActivityType.join => const Color(0xFF34D399),
      _ => const Color(0xFF626775),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Text.rich(
              TextSpan(
                style: const TextStyle(
                    color: Color(0xFFA0A5B5), fontSize: 11),
                children: [
                  TextSpan(
                    text: item.actor.displayName,
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                  TextSpan(text: ' ${item.type.label}'),
                ],
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
