import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../../core/models/models.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';

class NotificationsPage extends ConsumerWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifs = ref.watch(notificationsProvider);
    final api = ref.read(apiServiceProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppColors.backgroundDark,
        elevation: 0,
        title: const Text(
          'Thông báo',
          style: AppTextStyles.headingLarge,
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              try {
                await api.markAllNotificationsRead();
                ref.invalidate(notificationsProvider);
                ref.invalidate(unreadCountProvider);
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Lỗi: $e')),
                  );
                }
              }
            },
            child: const Text('Đánh dấu đã đọc'),
          ),
        ],
      ),
      body: notifs.when(
        loading: () =>
            const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (e, _) => _ErrorView(
          message: e.toString(),
          onRetry: () => ref.invalidate(notificationsProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const _EmptyView();
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(notificationsProvider);
              ref.invalidate(unreadCountProvider);
              await ref.read(notificationsProvider.future);
            },
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: items.length,
              separatorBuilder: (_, __) => const Divider(
                color: AppColors.borderLight,
                height: 1,
                indent: 70,
              ),
              itemBuilder: (_, i) => _NotificationTile(
                notification: items[i],
                onTap: () => _handleTap(context, ref, items[i]),
                onMarkRead: (read) async {
                  await api.setNotificationRead(items[i].id, read);
                  ref.invalidate(notificationsProvider);
                  ref.invalidate(unreadCountProvider);
                },
                onDelete: () async {
                  await api.deleteNotification(items[i].id);
                  ref.invalidate(notificationsProvider);
                  ref.invalidate(unreadCountProvider);
                },
              ),
            ),
          );
        },
      ),
    );
  }

  void _handleTap(BuildContext context, WidgetRef ref, NotificationModel n) {
    final data = n.data ?? const {};
    final postId = data['postId'] ?? data['post_id'];
    final userId = data['userId'] ?? data['user_id'] ?? n.actorId;
    final conversationId =
        data['conversationId'] ?? data['conversation_id'];

    if (postId is String) {
      // No post-detail screen yet — fall back to feed tab.
      context.go('/');
    } else if (conversationId is String) {
      context.pushNamed('chat', pathParameters: {'id': conversationId});
    } else if (userId is String) {
      context.pushNamed('userProfile', pathParameters: {'id': userId});
    }

    // Mark as read.
    if (!n.read) {
      ref.read(apiServiceProvider).setNotificationRead(n.id, true).then((_) {
        ref.invalidate(notificationsProvider);
        ref.invalidate(unreadCountProvider);
      });
    }
  }
}

class _NotificationTile extends StatelessWidget {
  final NotificationModel notification;
  final VoidCallback onTap;
  final ValueChanged<bool> onMarkRead;
  final VoidCallback onDelete;
  const _NotificationTile({
    required this.notification,
    required this.onTap,
    required this.onMarkRead,
    required this.onDelete,
  });

  IconData get _icon {
    switch (notification.type) {
      case 'like':
        return Icons.favorite_rounded;
      case 'comment':
        return Icons.mode_comment_rounded;
      case 'share':
        return Icons.send_rounded;
      case 'follow':
      case 'friend_request':
        return Icons.person_add_rounded;
      case 'friend_accept':
        return Icons.check_circle_rounded;
      case 'mention':
        return Icons.alternate_email_rounded;
      case 'group_invite':
        return Icons.group_add_rounded;
      case 'system':
      default:
        return Icons.notifications_rounded;
    }
  }

  Color get _iconColor {
    switch (notification.type) {
      case 'like':
        return AppColors.primaryPink;
      case 'comment':
        return AppColors.secondaryCyan;
      case 'share':
        return AppColors.primaryOrange;
      case 'follow':
      case 'friend_request':
      case 'friend_accept':
        return AppColors.secondaryBlue;
      case 'mention':
        return AppColors.primaryPurple;
      default:
        return AppColors.textSecondary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final n = notification;
    return Material(
      color: n.read
          ? AppColors.backgroundDark
          : AppColors.primaryPink.withValues(alpha: 0.04),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Avatar(avatarUrl: n.actor?.avatar, isOnline: false),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(_icon, size: 14, color: _iconColor),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            n.title,
                            style: AppTextStyles.bodyMedium.copyWith(
                              fontWeight: n.read
                                  ? FontWeight.w500
                                  : FontWeight.w700,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (n.body.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(n.body,
                          style: AppTextStyles.bodySmall,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      timeago.format(n.createdAt),
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                color: AppColors.backgroundCard,
                icon: const Icon(Icons.more_vert_rounded,
                    color: AppColors.textMuted, size: 18),
                onSelected: (v) {
                  if (v == 'read') onMarkRead(!n.read);
                  if (v == 'delete') onDelete();
                },
                itemBuilder: (_) => [
                  PopupMenuItem(
                    value: 'read',
                    child: Text(n.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'),
                  ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Text('Xóa', style: TextStyle(color: Colors.redAccent)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String? avatarUrl;
  final bool isOnline;
  const _Avatar({required this.avatarUrl, required this.isOnline});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        CircleAvatar(
          radius: 24,
          backgroundColor: AppColors.backgroundInput,
          backgroundImage:
              (avatarUrl != null && avatarUrl!.isNotEmpty) ? NetworkImage(avatarUrl!) : null,
          child: (avatarUrl == null || avatarUrl!.isEmpty)
              ? const Icon(Icons.person_rounded,
                  color: AppColors.textSecondary, size: 22)
              : null,
        ),
      ],
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.notifications_off_rounded,
              size: 64, color: AppColors.textMuted),
          SizedBox(height: 12),
          Text('Chưa có thông báo nào',
              style: AppTextStyles.bodyMedium),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline_rounded,
              size: 48, color: Colors.redAccent),
          const SizedBox(height: 8),
          Text('Lỗi: $message', style: AppTextStyles.bodyMedium),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Thử lại')),
        ],
      ),
    );
  }
}
