import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/models/models.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_image.dart';

class SearchPage extends ConsumerStatefulWidget {
  const SearchPage({super.key});
  @override
  ConsumerState<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends ConsumerState<SearchPage> {
  final _controller = TextEditingController();
  String _query = '';
  Timer? _debounce;

  @override
  void dispose() {
    _controller.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = q);
    });
  }

  @override
  Widget build(BuildContext context) {
    final results = ref.watch(userSearchProvider(_query));
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppColors.backgroundDark,
        elevation: 0,
        title: TextField(
          controller: _controller,
          autofocus: true,
          onChanged: _onChanged,
          style: AppTextStyles.bodyMedium,
          decoration: InputDecoration(
            hintText: 'Tìm kiếm người dùng...',
            hintStyle: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.textMuted,
            ),
            border: InputBorder.none,
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close_rounded,
                        color: AppColors.textMuted),
                    onPressed: () {
                      _controller.clear();
                      setState(() => _query = '');
                    },
                  ),
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
      ),
      body: _query.isEmpty
          ? const _EmptySearch()
          : results.when(
              loading: () => const Center(
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              error: (e, _) => Center(
                child: Text('Lỗi: $e', style: AppTextStyles.bodyMedium),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return const Center(
                    child: Text('Không có kết quả',
                        style: AppTextStyles.bodyMedium),
                  );
                }
                return ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const Divider(
                    color: AppColors.borderLight,
                    height: 1,
                    indent: 70,
                  ),
                  itemBuilder: (_, i) =>
                      _ResultTile(user: list[i]),
                );
              },
            ),
    );
  }
}

class _ResultTile extends StatelessWidget {
  final UserModel user;
  const _ResultTile({required this.user});

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () =>
          context.pushNamed('userProfile', pathParameters: {'id': user.id}),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: CircleAvatar(
        radius: 24,
        backgroundColor: AppColors.backgroundInput,
        backgroundImage: safeNetworkImage(user.avatar),
        child: (user.avatar == null || user.avatar!.isEmpty || isPlaceholderUrl(user.avatar))
            ? const Icon(Icons.person_rounded, color: AppColors.textSecondary)
            : null,
      ),
      title: Text(user.name, style: AppTextStyles.bodyMedium),
      subtitle: Text('@${user.username}', style: AppTextStyles.bodySmall),
    );
  }
}

class _EmptySearch extends StatelessWidget {
  const _EmptySearch();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.search_rounded, size: 64, color: AppColors.textMuted),
          SizedBox(height: 12),
          Text('Tìm kiếm bạn bè, người quen',
              style: AppTextStyles.bodyMedium),
        ],
      ),
    );
  }
}
