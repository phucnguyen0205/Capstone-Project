import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/services/api_service.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Modal shown in chat settings — add a member to a group.
///
/// Mirrors `AddMemberModal` in web.
class AddMemberModal extends ConsumerStatefulWidget {
  final String conversationId;
  const AddMemberModal({super.key, required this.conversationId});

  static Future<bool?> show(BuildContext context,
      {required String conversationId}) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF171920),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) =>
          AddMemberModal(conversationId: conversationId),
    );
  }

  @override
  ConsumerState<AddMemberModal> createState() => _AddMemberModalState();
}

class _AddMemberModalState extends ConsumerState<AddMemberModal> {
  final _searchCtrl = TextEditingController();
  bool _adding = false;
  String _query = '';
  List<UserModel> _results = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() {
      setState(() => _query = _searchCtrl.text.trim());
      _fetch();
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    if (_query.isEmpty) {
      setState(() => _results = const []);
      return;
    }
    setState(() => _loading = true);
    try {
      final raw =
          await ApiService().searchUsers(_query);
      final list = raw
          .whereType<Map<String, dynamic>>()
          .map(UserModel.fromJson)
          .toList();
      if (!mounted) return;
      setState(() {
        _results = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _add(UserModel user) async {
    if (_adding) return;
    setState(() => _adding = true);
    try {
      // Send a friend request; full group-member invite isn't wired
      // in the backend yet, so we treat this as "request to add".
      await ApiService().sendFriendRequest(user.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã gửi yêu cầu kết bạn tới ${user.name}')),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _adding = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không thể thêm: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (_, controller) {
        return SafeArea(
          child: Column(
            children: [
              Container(
                height: 52,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: const BoxDecoration(
                  border: Border(
                      bottom: BorderSide(color: Color(0xFF242831))),
                ),
                child: Stack(
                  children: [
                    Center(
                      child: const Text('Thêm thành viên',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 14)),
                    ),
                    Positioned(
                      right: 0,
                      top: 0,
                      bottom: 0,
                      child: IconButton(
                        icon: const Icon(LucideIcons.x,
                            color: Color(0xFFA0A5B5), size: 18),
                        onPressed: () => Navigator.of(context).pop(false),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF0C0C14),
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
                          controller: _searchCtrl,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13),
                          decoration: const InputDecoration(
                            hintText: 'Tìm theo tên hoặc @username',
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
              Expanded(
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(
                            color: Color(0xFFFF2E93)))
                    : _results.isEmpty
                        ? Center(
                            child: Padding(
                              padding: const EdgeInsets.all(20),
                              child: Text(
                                _query.isEmpty
                                    ? 'Nhập tên hoặc username để tìm.'
                                    : 'Không tìm thấy người dùng nào.',
                                style: const TextStyle(
                                    color: Color(0xFF626775), fontSize: 13),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          )
                        : ListView.separated(
                            controller: controller,
                            itemCount: _results.length,
                            separatorBuilder: (_, __) => const Divider(
                                color: Color(0xFF242831), height: 1),
                            itemBuilder: (_, i) {
                              final u = _results[i];
                              return ListTile(
                                leading: Container(
                                  width: 36,
                                  height: 36,
                                  decoration: const BoxDecoration(
                                    shape: BoxShape.circle,
                                    gradient: LinearGradient(
                                      colors: [
                                        Color(0xFFFF2E93),
                                        Color(0xFFFF8A56)
                                      ],
                                    ),
                                  ),
                                  child: Center(
                                    child: Text(
                                      u.name.isNotEmpty
                                          ? u.name[0].toUpperCase()
                                          : '?',
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                ),
                                title: Text(u.name,
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600)),
                                subtitle: Text('@${u.username}',
                                    style: const TextStyle(
                                        color: Color(0xFF626775),
                                        fontSize: 11)),
                                trailing: _adding
                                    ? const SizedBox(
                                        width: 16,
                                        height: 16,
                                        child: CircularProgressIndicator(
                                            color: Color(0xFFFF2E93),
                                            strokeWidth: 2),
                                      )
                                    : IconButton(
                                        icon: const Icon(LucideIcons.userPlus,
                                            color: Color(0xFFFF2E93),
                                            size: 16),
                                        onPressed: () => _add(u),
                                      ),
                              );
                            },
                          ),
              ),
            ],
          ),
        );
      },
    );
  }
}
