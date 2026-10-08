import 'package:flutter/material.dart';

import '../../../../core/models/group_tier_model.dart';

/// Horizontal scrollable chip row that filters groups feed by lens.
///
/// Mirrors `LensFilterChips` in web.
class LensFilterChips extends StatelessWidget {
  final GroupLens active;
  final ValueChanged<GroupLens> onChange;
  final Map<String, int>? counts;
  const LensFilterChips({
    super.key,
    required this.active,
    required this.onChange,
    this.counts,
  });

  @override
  Widget build(BuildContext context) {
    final items = <_Chip>[
      _Chip(
        lens: GroupLens.all,
        label: 'Tất cả',
        gradient: const LinearGradient(
          colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
        ),
        count: counts?['all'],
      ),
      _Chip(
        lens: GroupLens.public,
        label: 'Công khai',
        gradient: const LinearGradient(
          colors: [Color(0xFF06B6D4), Color(0xFF34D399)],
        ),
        count: counts?['public'],
      ),
      _Chip(
        lens: GroupLens.friends,
        label: 'Bè bạn',
        gradient: const LinearGradient(
          colors: [Color(0xFFFBBF24), Color(0xFFF97316)],
        ),
        count: counts?['friends'],
      ),
      _Chip(
        lens: GroupLens.close,
        label: 'Thân thiết',
        gradient: const LinearGradient(
          colors: [Color(0xFFFF2E93), Color(0xFFF472B6)],
        ),
        count: counts?['close'],
      ),
      _Chip(
        lens: GroupLens.private,
        label: 'Riêng tư',
        gradient: const LinearGradient(
          colors: [Color(0xFF6B7280), Color(0xFF374151)],
        ),
        count: counts?['private'],
      ),
    ];

    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final c = items[i];
          return _ChipView(
            label: c.label,
            gradient: c.gradient,
            count: c.count,
            isActive: c.lens == active,
            onTap: () => onChange(c.lens),
          );
        },
      ),
    );
  }
}

class _Chip {
  final GroupLens lens;
  final String label;
  final Gradient gradient;
  final int? count;
  _Chip({
    required this.lens,
    required this.label,
    required this.gradient,
    this.count,
  });
}

class _ChipView extends StatelessWidget {
  final String label;
  final Gradient gradient;
  final int? count;
  final bool isActive;
  final VoidCallback onTap;
  const _ChipView({
    required this.label,
    required this.gradient,
    required this.count,
    required this.isActive,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          gradient: isActive ? gradient : null,
          color: isActive ? null : const Color(0xFF171920),
          border: Border.all(
              color: isActive
                  ? Colors.transparent
                  : const Color(0xFF242831)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Text(
              label,
              style: TextStyle(
                  color: isActive ? Colors.white : const Color(0xFFA0A5B5),
                  fontSize: 11,
                  fontWeight: FontWeight.w600),
            ),
            if (count != null && count! > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: isActive
                      ? Colors.white.withOpacity(0.25)
                      : const Color(0xFF2A2D37),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  count.toString(),
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
