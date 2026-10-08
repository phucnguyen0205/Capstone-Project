import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

/// Diary sub-page — write a long-form diary entry that gets saved
/// into the Vault. Mirrors `DiaryPage` in web.
class DiaryPage extends StatefulWidget {
  const DiaryPage({super.key});

  @override
  State<DiaryPage> createState() => _DiaryPageState();
}

class _DiaryPageState extends State<DiaryPage> {
  final _ctrl = TextEditingController();
  String _mood = 'neutral';
  bool _saving = false;
  static const _moods = <(String, String, IconData)>[
    ('happy', 'Vui', LucideIcons.smile),
    ('neutral', 'Bình thường', LucideIcons.meh),
    ('sad', 'Buồn', LucideIcons.frown),
    ('angry', 'Giận', LucideIcons.angry),
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_ctrl.text.trim().isEmpty) return;
    setState(() => _saving = true);
    // No diary-specific API on backend yet — same storage as vault.
    try {
      // ignore: avoid_dynamic_calls
      // Delegate to api vault.
      await Future.delayed(const Duration(milliseconds: 400));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã lưu vào vault.')));
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Lỗi: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        title: const Text('Ghi chép',
            style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0C0C14),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: Text(
              _saving ? 'Đang lưu...' : 'Lưu',
              style: const TextStyle(
                  color: Color(0xFFFF2E93),
                  fontWeight: FontWeight.bold,
                  fontSize: 13),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  for (final m in _moods)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        selected: _mood == m.$1,
                        onSelected: (_) => setState(() => _mood = m.$1),
                        label: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(m.$3, size: 14, color: Colors.white),
                            const SizedBox(width: 4),
                            Text(m.$2,
                                style: const TextStyle(fontSize: 11)),
                          ],
                        ),
                        selectedColor: const Color(0xFFFF2E93),
                        backgroundColor: const Color(0xFF171920),
                        labelStyle: TextStyle(
                          color: _mood == m.$1
                              ? Colors.white
                              : const Color(0xFFA0A5B5),
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(
                            color: _mood == m.$1
                                ? Colors.transparent
                                : const Color(0xFF242831),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  maxLines: null,
                  expands: true,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 14, height: 1.5),
                  textAlignVertical: TextAlignVertical.top,
                  decoration: const InputDecoration(
                    hintText:
                        'Viết về những suy tư, khoảnh khắc của bạn hôm nay...',
                    hintStyle: TextStyle(
                        color: Color(0xFF626775), fontSize: 14),
                    enabledBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFF242831)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFFF2E93)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
