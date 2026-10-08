import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/models/group_tier_model.dart';
import '../../../../core/providers/groups_providers.dart';

/// Radar sub-page — shows tier counts (mirror / close / friends /
/// public / all) at the top, then the filtered groups feed.
///
/// Mirrors `RadarPage` in web.
class RadarPage extends ConsumerWidget {
  const RadarPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tiersAsync = ref.watch(groupTiersProvider);
    final lens = ref.watch(groupLensFilterProvider);
    final lensKey =
        lens == GroupLens.all ? 'all' : lens.wire;
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        title: const Text('Radar',
            style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0C0C14),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Tóm tắt các nhóm và mối quan hệ của bạn',
                style: TextStyle(color: Color(0xFF626775), fontSize: 12),
              ),
              const SizedBox(height: 16),
              tiersAsync.when(
                data: (t) => _TierGrid(
                    tiers: t.tiers, total: t.total, active: lensKey),
                loading: () => const Center(
                    child: CircularProgressIndicator(
                        color: Color(0xFFFF2E93))),
                error: (e, _) => Text('Lỗi: $e',
                    style: const TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  const Icon(LucideIcons.compass,
                      color: Color(0xFFFF2E93), size: 14),
                  const SizedBox(width: 6),
                  const Text('Gợi ý kết nối',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 8),
              _SuggestionCard(
                title: 'Mở rộng kết nối công khai',
                subtitle:
                    'Bạn đang có ít bài công khai — hãy đăng thêm để tăng tương tác.',
                icon: LucideIcons.globe,
                gradient: const LinearGradient(
                  colors: [Color(0xFF06B6D4), Color(0xFF34D399)],
                ),
              ),
              const SizedBox(height: 8),
              _SuggestionCard(
                title: 'Thử tham gia trắc nghiệm tính cách',
                subtitle:
                    'Khám phá chòm sao MBTI để tìm điểm chung với bạn bè.',
                icon: LucideIcons.sparkles,
                gradient: const LinearGradient(
                  colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
                ),
                onTap: () => context.go('/groups/quiz'),
              ),
              const SizedBox(height: 8),
              _SuggestionCard(
                title: 'Ghi chép nhật ký',
                subtitle:
                    'Lưu lại những khoảnh khắc trong vault để nhìn lại sau này.',
                icon: LucideIcons.bookOpen,
                gradient: const LinearGradient(
                  colors: [Color(0xFFFBBF24), Color(0xFFF97316)],
                ),
                onTap: () => context.go('/groups/vault'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TierGrid extends StatelessWidget {
  final List<GroupTierInfo> tiers;
  final int total;
  final String active;
  const _TierGrid({
    required this.tiers,
    required this.total,
    required this.active,
  });

  @override
  Widget build(BuildContext context) {
    final colorMap = <String, List<Color>>{
      'all': const [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
      'public': const [Color(0xFF06B6D4), Color(0xFF34D399)],
      'friends': const [Color(0xFFFBBF24), Color(0xFFF97316)],
      'close': const [Color(0xFFFF2E93), Color(0xFFF472B6)],
      'private': const [Color(0xFF6B7280), Color(0xFF374151)],
    };
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate:
          const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.4,
      ),
      itemCount: tiers.length,
      itemBuilder: (_, i) {
        final t = tiers[i];
        final isActive = t.key == active;
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: colorMap[t.key] ??
                  const [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    t.label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12),
                  ),
                  if (isActive)
                    const Padding(
                      padding: EdgeInsets.only(left: 6),
                      child: Icon(LucideIcons.check,
                          color: Colors.white, size: 12),
                    ),
                ],
              ),
              const Spacer(),
              Text(
                t.count.toString(),
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 24),
              ),
              Text(
                'lượt quan hệ',
                style: const TextStyle(color: Colors.white70, fontSize: 10),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Gradient gradient;
  final VoidCallback? onTap;
  const _SuggestionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF171920),
          border: Border.all(color: const Color(0xFF242831)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                gradient: gradient,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: const TextStyle(
                          color: Color(0xFFA0A5B5), fontSize: 11)),
                ],
              ),
            ),
            const Icon(LucideIcons.arrowRight,
                color: Color(0xFF626775), size: 14),
          ],
        ),
      ),
    );
  }
}
