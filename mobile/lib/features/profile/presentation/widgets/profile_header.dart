import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';

/// Hero header: cover, avatar, identity, action buttons.
///
/// Mirrors the web `profile/[username]/page.tsx` cover/avatar/identity
/// section. When `user` is the current viewer, shows an Edit button and
/// the avatar/cover are tappable to upload via Cloudinary.
class ProfileHeader extends ConsumerWidget {
  final UserModel user;
  final bool isMe;
  final VoidCallback? onCoverChange;
  final VoidCallback? onAvatarChange;

  const ProfileHeader({
    super.key,
    required this.user,
    required this.isMe,
    this.onCoverChange,
    this.onAvatarChange,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Cover banner (5:1 ratio, gradient fallback)
        _CoverBanner(
          coverUrl: user.coverPhoto,
          isMe: isMe,
          onChange: onCoverChange,
        ),
        // Identity row: avatar overlapping the cover + name + actions
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: 64,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      top: -52,
                      child: _Avatar(
                        url: user.avatar,
                        name: user.name,
                        isOnline: user.isOnline,
                        isMe: isMe,
                        onTap: isMe ? onAvatarChange : null,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _IdentityBlock(user: user, isMe: isMe),
              const SizedBox(height: 16),
              _ActionButtons(user: user, isMe: isMe),
            ],
          ),
        ),
      ],
    );
  }
}

class _CoverBanner extends StatelessWidget {
  final String? coverUrl;
  final bool isMe;
  final VoidCallback? onChange;
  const _CoverBanner({
    required this.coverUrl,
    required this.isMe,
    this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 5 / 2,
      child: GestureDetector(
        onTap: isMe ? onChange : null,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (coverUrl != null && coverUrl!.isNotEmpty)
              CachedNetworkImage(
                imageUrl: coverUrl!,
                fit: BoxFit.cover,
                httpHeaders: const {
                  'User-Agent':
                      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
                  'Referer': 'https://accounts.google.com/',
                },
                errorWidget: (_, __, ___) => _gradient(),
                placeholder: (_, __) => _gradient(),
              )
            else
              _gradient(),
            // Fade gradient overlay from banner to content
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.transparent,
                      AppColors.backgroundDark.withOpacity(0.3),
                      AppColors.backgroundDark.withOpacity(0.7),
                    ],
                    stops: const [0.0, 0.5, 0.85, 1.0],
                  ),
                ),
              ),
            ),
            if (isMe)
              Positioned(
                right: 12,
                top: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.55),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.camera_alt_outlined,
                          size: 14, color: Colors.white),
                      SizedBox(width: 6),
                      Text(
                        'Đổi ảnh bìa',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _gradient() => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.primaryPink, AppColors.primaryOrange],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
      );
}

class _Avatar extends StatelessWidget {
  final String? url;
  final String? name;
  final bool isOnline;
  final bool isMe;
  final VoidCallback? onTap;
  const _Avatar({
    required this.url,
    this.name,
    required this.isOnline,
    required this.isMe,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 104,
        height: 104,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 104,
              height: 104,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.backgroundCard,
                border: Border.all(color: AppColors.backgroundDark, width: 4),
              ),
              child: ClipOval(
                child: SafeAvatar(
                  imageUrl: url,
                  name: name,
                  size: 104,
                ),
              ),
            ),
            // presence dot
            Positioned(
              right: 8,
              bottom: 8,
              child: Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  color: isOnline ? const Color(0xFF22C55E) : AppColors.textMuted,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.backgroundDark, width: 3),
                ),
              ),
            ),
            if (isMe)
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    gradient: AppColors.primaryGradient,
                    shape: BoxShape.circle,
                  ),
                  child:
                      const Icon(Icons.camera_alt, size: 14, color: Colors.white),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _IdentityBlock extends StatelessWidget {
  final UserModel user;
  final bool isMe;
  const _IdentityBlock({required this.user, required this.isMe});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Flexible(
              child: Text(
                user.name.isNotEmpty ? user.name : '@${user.username}',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                  height: 1.15,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: const BoxDecoration(
                gradient: AppColors.primaryGradient,
                borderRadius: BorderRadius.all(Radius.circular(10)),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.verified, size: 12, color: Colors.white),
                  SizedBox(width: 4),
                  Text(
                    'Verified',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          '@${user.username}',
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.textSecondary,
          ),
        ),
        if (user.bio != null && user.bio!.trim().isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            user.bio!,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.textPrimary,
              height: 1.5,
            ),
          ),
        ],
      ],
    );
  }
}

class _ActionButtons extends StatelessWidget {
  final UserModel user;
  final bool isMe;
  const _ActionButtons({required this.user, required this.isMe});

  @override
  Widget build(BuildContext context) {
    final shareUrl = 'https://nameapp.example/u/${user.username}';
    return Row(
      children: [
        Expanded(
          child: isMe
              ? _PrimaryButton(
                  icon: Icons.edit_rounded,
                  label: 'Chỉnh sửa trang cá nhân',
                  onTap: () =>
                      context.pushNamed(AppRoutes.editProfile),
                )
              : _PrimaryButton(
                  icon: Icons.person_add_alt_1_rounded,
                  label: _primaryLabel(user),
                  onTap: () {
                    // For now show a snackbar — full follow flow is on
                    // OtherUserProfilePage. The own profile page only
                    // ever hits this branch for `isMe=true`.
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                            'Mở trang cá nhân công khai để kết nối'),
                      ),
                    );
                  },
                ),
        ),
        const SizedBox(width: 8),
        _IconButton(
          icon: Icons.share_rounded,
          onTap: () async {
            await Clipboard.setData(ClipboardData(text: shareUrl));
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đã sao chép liên kết')),
              );
            }
          },
        ),
      ],
    );
  }

  String _primaryLabel(UserModel u) {
    if (u.isFriend == true) return 'Bạn bè';
    if (u.isFollowing == true) return 'Đang theo dõi';
    return 'Theo dõi';
  }
}

class _PrimaryButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  const _PrimaryButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          gradient: AppColors.primaryGradient,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: Colors.white),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _IconButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: AppColors.backgroundInput,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Icon(icon, size: 18, color: AppColors.textPrimary),
      ),
    );
  }
}
