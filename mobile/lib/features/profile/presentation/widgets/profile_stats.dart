import 'package:flutter/material.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/theme/app_theme.dart';

/// 4-tile stats grid mirroring the web `StatTile` row.
///
/// Tiles: Bài viết · Bạn bè · Người theo dõi · Đang theo dõi.
/// Each tile emits `onTap` so the caller can open a list modal/sheet.
class ProfileStats extends StatelessWidget {
  final UserModel user;
  final VoidCallback? onPostsTap;
  final VoidCallback? onFriendsTap;
  final VoidCallback? onFollowersTap;
  final VoidCallback? onFollowingTap;

  const ProfileStats({
    super.key,
    required this.user,
    this.onPostsTap,
    this.onFriendsTap,
    this.onFollowersTap,
    this.onFollowingTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          Expanded(
            child: _StatTile(
              label: 'Bài viết',
              value: user.postsCount ?? 0,
              icon: Icons.grid_on_rounded,
              onTap: onPostsTap,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatTile(
              label: 'Bạn bè',
              value: user.friendsCount ?? 0,
              icon: Icons.people_alt_rounded,
              onTap: onFriendsTap,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatTile(
              label: 'Người theo dõi',
              value: user.followersCount ?? 0,
              icon: Icons.person_outline_rounded,
              onTap: onFollowersTap,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _StatTile(
              label: 'Đang theo dõi',
              value: user.followingCount ?? 0,
              icon: Icons.person_add_alt_1_rounded,
              onTap: onFollowingTap,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final int value;
  final IconData icon;
  final VoidCallback? onTap;
  const _StatTile({
    required this.label,
    required this.value,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: AppColors.backgroundElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                gradient: AppColors.primaryGradient,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 14, color: Colors.white),
            ),
            const SizedBox(height: 6),
            Text(
              _format(value),
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
                height: 1.1,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontSize: 10,
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  static String _format(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}
