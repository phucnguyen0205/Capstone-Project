import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers/providers.dart';
import '../../../core/theme/app_theme.dart';

/// Shell host for the 5 main bottom-nav tabs. It contains the
/// IndexedStack + bottom bar and renders whichever child the GoRouter
/// ShellRoute hands to it.
class MainNavigationPage extends ConsumerWidget {
  final Widget child;
  const MainNavigationPage({super.key, required this.child});

  static const _tabs = [
    ('/', Icons.home_rounded, 'Trang chủ'),
    ('/explore', Icons.explore_rounded, 'Khám phá'),
    ('/messages', Icons.chat_bubble_rounded, 'Tin nhắn'),
    ('/groups', Icons.people_rounded, 'Nhóm'),
    ('/profile', Icons.person_rounded, 'Cá nhân'),
  ];

  int _indexFor(String location) {
    for (int i = 0; i < _tabs.length; i++) {
      if (location == _tabs[i].$1 || location.startsWith('${_tabs[i].$1}/')) {
        return i;
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _indexFor(location);
    final unread = ref.watch(unreadCountProvider);

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppColors.backgroundCard,
          border: Border(
            top: BorderSide(color: AppColors.borderLight, width: 1),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: List.generate(_tabs.length, (i) {
                final (path, icon, label) = _tabs[i];
                final isActive = i == currentIndex;
                return Expanded(
                  child: _NavItem(
                    icon: icon,
                    label: label,
                    isActive: isActive,
                    badge: i == 0
                        ? unread.maybeWhen(
                            data: (c) => c > 0 ? c.toString() : null,
                            orElse: () => null,
                          )
                        : null,
                    onTap: () => context.go(path),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final String? badge;
  final VoidCallback onTap;
  const _NavItem({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.primaryPink.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(icon,
                    color: isActive
                        ? AppColors.primaryPink
                        : AppColors.textSecondary,
                    size: 22),
                if (badge != null)
                  Positioned(
                    right: -8,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.primaryPink,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(badge!,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w800)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: AppTextStyles.tabActive.copyWith(
                color: isActive
                    ? AppColors.primaryPink
                    : AppColors.textSecondary,
                fontSize: 10,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
