import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/models/models.dart';
import '../../../../core/providers/vault_providers.dart';
import '../../../../core/services/api_service.dart';

/// Vault sub-page — list private diary notes + mood stats.
///
/// Mirrors `VaultPage` in web.
class VaultPage extends ConsumerWidget {
  const VaultPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dataAsync = ref.watch(vaultDataProvider);
    final mood = ref.watch(vaultMoodFilterProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0C0C14),
      appBar: AppBar(
        title: const Text('Vault',
            style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF0C0C14),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFFF2E93),
        onPressed: () => _showCreateSheet(context, ref),
        child: const Icon(LucideIcons.plus, color: Colors.white),
      ),
      body: dataAsync.when(
        data: (data) {
          final notes = data.notes
              .where((n) => mood == null || n.mood == mood)
              .toList();
          return SafeArea(
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: _StatsCard(
                    total: data.stats.total,
                    thisWeek: data.stats.thisWeek,
                    positiveRatio: data.stats.positiveRatio,
                  ),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: _MoodChips(
                      selected: mood,
                      onChange: (m) =>
                          ref.read(vaultMoodFilterProvider.notifier).state = m,
                    ),
                  ),
                ),
                if (notes.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Text('Chưa có ghi chép nào.',
                          style: TextStyle(
                              color: Color(0xFF626775), fontSize: 13)),
                    ),
                  )
                else
                  SliverList.separated(
                    itemCount: notes.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) => _NoteCard(note: notes[i]),
                  ),
                const SliverPadding(padding: EdgeInsets.only(bottom: 80)),
              ],
            ),
          );
        },
        loading: () => const Center(
            child: CircularProgressIndicator(color: Color(0xFFFF2E93))),
        error: (e, _) => Center(
          child: Text('Lỗi: $e',
              style: const TextStyle(color: Colors.red)),
        ),
      ),
    );
  }

  void _showCreateSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF171920),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _CreateNoteSheet(),
    );
  }
}

class _StatsCard extends StatelessWidget {
  final int total;
  final int thisWeek;
  final int positiveRatio;
  const _StatsCard({
    required this.total,
    required this.thisWeek,
    required this.positiveRatio,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          _Stat(label: 'Tổng', value: '$total'),
          _Stat(label: 'Tuần này', value: '$thisWeek'),
          _Stat(label: 'Tích cực', value: '$positiveRatio%'),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;
  const _Stat({required this.label, required this.value});
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 10)),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _MoodChips extends StatelessWidget {
  final VaultMood? selected;
  final ValueChanged<VaultMood?> onChange;
  const _MoodChips({required this.selected, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final entries = <_MoodEntry>[
      _MoodEntry(mood: null, label: 'Tất cả', emoji: '✨'),
      _MoodEntry(
          mood: VaultMood.happy, label: 'Vui', emoji: VaultMood.happy.emoji),
      _MoodEntry(
          mood: VaultMood.neutral,
          label: 'Bình thường',
          emoji: VaultMood.neutral.emoji),
      _MoodEntry(
          mood: VaultMood.sad, label: 'Buồn', emoji: VaultMood.sad.emoji),
      _MoodEntry(
          mood: VaultMood.angry, label: 'Giận', emoji: VaultMood.angry.emoji),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final e in entries)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: ChoiceChip(
                selected: selected == e.mood,
                onSelected: (_) => onChange(e.mood),
                label: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(e.emoji, style: const TextStyle(fontSize: 12)),
                    const SizedBox(width: 4),
                    Text(e.label,
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w600)),
                  ],
                ),
                selectedColor: const Color(0xFFFF2E93),
                backgroundColor: const Color(0xFF171920),
                labelStyle: TextStyle(
                  color: selected == e.mood
                      ? Colors.white
                      : const Color(0xFFA0A5B5),
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: BorderSide(
                    color: selected == e.mood
                        ? Colors.transparent
                        : const Color(0xFF242831),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MoodEntry {
  final VaultMood? mood;
  final String label;
  final String emoji;
  _MoodEntry({required this.mood, required this.label, required this.emoji});
}

class _NoteCard extends StatelessWidget {
  final VaultNoteModel note;
  const _NoteCard({required this.note});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF171920),
        border: Border.all(color: const Color(0xFF242831)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(note.mood.emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Text(note.mood.label,
                  style: const TextStyle(
                      color: Color(0xFFA0A5B5),
                      fontSize: 11,
                      fontWeight: FontWeight.w600)),
              const Spacer(),
              Text(
                '${note.createdAt.day}/${note.createdAt.month}/${note.createdAt.year}',
                style:
                    const TextStyle(color: Color(0xFF626775), fontSize: 10),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(note.content,
              style: const TextStyle(
                  color: Colors.white, fontSize: 13, height: 1.4)),
        ],
      ),
    );
  }
}

class _CreateNoteSheet extends StatefulWidget {
  const _CreateNoteSheet();
  @override
  State<_CreateNoteSheet> createState() => _CreateNoteSheetState();
}

class _CreateNoteSheetState extends State<_CreateNoteSheet> {
  final _ctrl = TextEditingController();
  VaultMood _mood = VaultMood.neutral;
  bool _saving = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_ctrl.text.trim().isEmpty) return;
    if (_saving) return;
    setState(() => _saving = true);
    try {
      final api = ApiService();
      await api.createVaultNote(
        content: _ctrl.text.trim(),
        mood: _mood.wire,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.lock,
                  color: Color(0xFFFBBF24), size: 14),
              const SizedBox(width: 6),
              const Text('Ghi chép riêng',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.bold)),
              const Spacer(),
              InkWell(
                onTap: () => Navigator.of(context).pop(),
                child: const Icon(LucideIcons.x,
                    color: Color(0xFF626775), size: 16),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: VaultMood.values.map((m) {
              final selected = m == _mood;
              return Padding(
                padding: const EdgeInsets.only(right: 6),
                child: ChoiceChip(
                  selected: selected,
                  onSelected: (_) => setState(() => _mood = m),
                  label: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(m.emoji, style: const TextStyle(fontSize: 12)),
                      const SizedBox(width: 4),
                      Text(m.label,
                          style:
                              const TextStyle(fontSize: 11)),
                    ],
                  ),
                  selectedColor: const Color(0xFFFF2E93),
                  backgroundColor: const Color(0xFF171920),
                  labelStyle: TextStyle(
                    color: selected
                        ? Colors.white
                        : const Color(0xFFA0A5B5),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(
                      color: selected
                          ? Colors.transparent
                          : const Color(0xFF242831),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _ctrl,
            maxLines: 6,
            style: const TextStyle(color: Colors.white, fontSize: 13),
            decoration: const InputDecoration(
              hintText: 'Hôm nay của bạn thế nào?',
              hintStyle:
                  TextStyle(color: Color(0xFF626775), fontSize: 13),
              enabledBorder: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFF242831)),
              ),
              focusedBorder: OutlineInputBorder(
                borderSide: BorderSide(color: Color(0xFFFF2E93)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
                ),
              ),
              child: TextButton(
                onPressed: _saving ? null : _save,
                child: Text(
                  _saving ? 'Đang lưu...' : 'Lưu vào vault',
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
