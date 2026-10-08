import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/providers/auth_controller.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/routing/app_router.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../widgets/profile_gallery.dart';
import '../widgets/profile_header.dart';
import '../widgets/profile_info_section.dart';
import '../widgets/profile_stats.dart';

/// Owner's profile page. Mirrors the web `profile/[username]/page.tsx` for
/// the viewer=owner case: cover/avatar editable, edit button, settings
/// menu with logout, posts grid with lens filter chips.
class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  bool _uploading = false;

  @override
  Widget build(BuildContext context) {
    final meAsync = ref.watch(meProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      body: SafeArea(
        bottom: false,
        child: meAsync.when(
          data: (me) => _buildBody(context, me),
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.primaryPink),
          ),
          error: (e, _) => _ErrorState(
            message: 'Không thể tải hồ sơ: $e',
            onRetry: () => ref.invalidate(meProvider),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, UserModel me) {
    return RefreshIndicator(
      color: AppColors.primaryPink,
      backgroundColor: AppColors.backgroundCard,
      onRefresh: () async {
        ref.invalidate(meProvider);
        ref.invalidate(userPostsProvider(me.id));
        await ref.read(meProvider.future);
      },
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(child: _buildTopBar(context)),
          SliverToBoxAdapter(
            child: ProfileHeader(
              user: me,
              isMe: true,
              onAvatarChange: () => _changeAvatar(me),
              onCoverChange: () => _changeCover(me),
            ),
          ),
          SliverToBoxAdapter(
            child: ProfileStats(
              user: me,
              onPostsTap: () => _scrollToPosts(context),
              onFriendsTap: () => _showListSoon(context, 'friends'),
              onFollowersTap: () => _showListSoon(context, 'followers'),
              onFollowingTap: () => _showListSoon(context, 'following'),
            ),
          ),
          SliverToBoxAdapter(child: ProfileInfoSection(user: me)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(0, 24, 0, 0),
              child: ProfileGallery(userId: me.id, isMe: true),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 96)),
        ],
      ),
    );
  }

  Widget _buildTopBar(BuildContext context) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: const BoxDecoration(
        color: AppColors.backgroundDark,
        border: Border(
          bottom: BorderSide(color: AppColors.borderLight, width: 1),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back,
                size: 20, color: AppColors.textPrimary),
            onPressed: () =>
                context.canPop() ? context.pop() : context.go('/'),
          ),
          const SizedBox(width: 4),
          const Text(
            'Hồ sơ',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const Spacer(),
          if (_uploading)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppColors.primaryPink),
              ),
            )
          else
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert,
                  color: AppColors.textPrimary, size: 20),
              color: AppColors.backgroundCard,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: AppColors.borderLight),
              ),
              onSelected: (v) async {
                switch (v) {
                  case 'edit':
                    context.pushNamed(AppRoutes.editProfile);
                    break;
                  case 'vault':
                    context.pushNamed(AppRoutes.vault);
                    break;
                  case 'settings':
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('Cài đặt — đang phát triển')),
                    );
                    break;
                  case 'logout':
                    await _confirmLogout();
                    break;
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'edit',
                  child: _MenuRow(icon: Icons.edit_rounded, label: 'Chỉnh sửa hồ sơ'),
                ),
                PopupMenuItem(
                  value: 'vault',
                  child: _MenuRow(icon: Icons.lock_outline_rounded, label: 'Hộp bí mật'),
                ),
                PopupMenuItem(
                  value: 'settings',
                  child: _MenuRow(icon: Icons.settings_rounded, label: 'Cài đặt'),
                ),
                PopupMenuDivider(),
                PopupMenuItem(
                  value: 'logout',
                  child: _MenuRow(
                      icon: Icons.logout_rounded,
                      label: 'Đăng xuất',
                      danger: true),
                ),
              ],
            ),
        ],
      ),
    );
  }

  void _scrollToPosts(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Cuộn xuống để xem bài viết')),
    );
  }

  void _showListSoon(BuildContext context, String kind) {
    final label = switch (kind) {
      'friends' => 'danh sách bạn bè',
      'followers' => 'người theo dõi',
      'following' => 'đang theo dõi',
      _ => 'danh sách',
    };
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Mở $label — đang phát triển')),
    );
  }

  Future<void> _confirmLogout() async {
    // IMPORTANT: pop with the *local* Navigator (not the GoRouter root
    // navigator). Calling `Navigator.pop(context, ...)` from inside a
    // dialog whose context lives under GoRouter routes the pop through
    // `go_router/src/delegate.dart:_handlePopPage → _completeRouteMatch`,
    // which removes the dialog match from `currentConfiguration` and
    // asserts it is not empty. That is the
    // delegate.dart:162 (`currentConfiguration.isNotEmpty`) assertion.
    // Using the page's local Navigator skips GoRouter's delegate entirely.
    final localNavigator = Navigator.of(context, rootNavigator: false);
    final ok = await showDialog<bool>(
      context: context,
      useRootNavigator: false,
      builder: (dialogCtx) => AlertDialog(
        backgroundColor: AppColors.backgroundCard,
        title: const Text('Đăng xuất?', style: TextStyle(color: AppColors.textPrimary)),
        content: const Text('Bạn sẽ cần đăng nhập lại để tiếp tục.', style: TextStyle(color: AppColors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => localNavigator.pop(false),
            child: const Text('Huỷ', style: TextStyle(color: AppColors.textSecondary)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.primaryPink),
            onPressed: () => localNavigator.pop(true),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    // Just call logout — the router's refreshListenable redirects to
    // /login when `isAuthenticatedProvider` flips to false. No manual
    // navigation, no dialog dismiss race.
    try {
      await ref.read(authControllerProvider).logout();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi đăng xuất: $e')),
        );
      }
    }
  }

  Future<void> _changeAvatar(UserModel me) async {
    final upload = ref.read(uploadServiceProvider);
    setState(() => _uploading = true);
    try {
      final result = await upload.pickAndUploadImage(type: UploadType.avatar);
      if (!mounted) return;
      final api = ref.read(apiServiceProvider);
      final updated = await api.updateMe({'avatar': result.url});
      // Update cached user dict so AuthController picks up the new avatar.
      final newUser = UserModel.fromJson(updated);
      final auth = ref.read(authServiceProvider).valueOrNull;
      if (auth != null) {
        await auth.setCurrentUser(newUser.toJson());
      }
      ref.invalidate(meProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã cập nhật ảnh đại diện')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload thất bại: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _changeCover(UserModel me) async {
    final upload = ref.read(uploadServiceProvider);
    setState(() => _uploading = true);
    try {
      final result = await upload.pickAndUploadImage(type: UploadType.cover);
      if (!mounted) return;
      final api = ref.read(apiServiceProvider);
      final updated = await api.updateMe({'cover_photo': result.url});
      final newUser = UserModel.fromJson(updated);
      final auth = ref.read(authServiceProvider).valueOrNull;
      if (auth != null) {
        await auth.setCurrentUser(newUser.toJson());
      }
      ref.invalidate(meProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã cập nhật ảnh bìa')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload thất bại: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool danger;
  const _MenuRow({
    required this.icon,
    required this.label,
    this.danger = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon,
            size: 18,
            color: danger ? AppColors.primaryPink : AppColors.textPrimary),
        const SizedBox(width: 10),
        Text(
          label,
          style: TextStyle(
            color: danger ? AppColors.primaryPink : AppColors.textPrimary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_rounded,
              size: 56, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.primaryPink),
            onPressed: onRetry,
            child: const Text('Thử lại'),
          ),
        ],
      ),
    );
  }
}
