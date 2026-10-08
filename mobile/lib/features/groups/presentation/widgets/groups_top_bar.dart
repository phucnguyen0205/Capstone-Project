import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Top filter bar for groups feed with 5 lens chips (mirror, close,
/// friends, public, all) + search + create group button.
///
/// Mirrors `GroupsTopBar` in web `GroupsPage.tsx`.
class GroupsTopBar extends StatelessWidget {
  final String searchQuery;
  final void Function(String) onSearchChanged;
  final VoidCallback onCreateGroup;
  const GroupsTopBar({
    super.key,
    required this.searchQuery,
    required this.onSearchChanged,
    required this.onCreateGroup,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: const BoxDecoration(
        color: Color(0xFF0C0C14),
        border: Border(bottom: BorderSide(color: Color(0xFF242831))),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF171920),
                    border: Border.all(color: const Color(0xFF242831)),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.search,
                          color: Color(0xFF626775), size: 14),
                      const SizedBox(width: 6),
                      Expanded(
                        child: TextField(
                          onChanged: onSearchChanged,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13),
                          decoration: const InputDecoration(
                            hintText: 'Tìm trong nhóm...',
                            hintStyle: TextStyle(
                                color: Color(0xFF626775), fontSize: 13),
                            border: InputBorder.none,
                            isDense: true,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF8B5CF6), Color(0xFF14B8A6)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: IconButton(
                  icon: const Icon(LucideIcons.userPlus,
                      color: Colors.white, size: 14),
                  onPressed: onCreateGroup,
                  tooltip: 'Tạo nhóm mới',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
