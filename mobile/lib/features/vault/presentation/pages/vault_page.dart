import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../../core/models/models.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/theme/app_theme.dart';

class VaultPage extends ConsumerWidget {
  const VaultPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = ref.watch(vaultNotesProvider);
    final stats = ref.watch(vaultStatsProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppColors.backgroundDark,
        elevation: 0,
        title: const Text('Hộp bí mật', style: AppTextStyles.headingLarge),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateSheet(context, ref),
        backgroundColor: AppColors.primaryPink,
        icon: const Icon(Icons.add_rounded, color: Colors.white),
        label: const Text('Viết', style: TextStyle(color: Colors.white)),
      ),
      body: Column(
        children: [
          _StatsHeader(stats: stats),
          const Divider(color: AppColors.borderLight, height: 1),
          Expanded(
            child: notes.when(
              loading: () => const Center(
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              error: (e, _) => Center(
                child: Text('Lỗi: $e', style: AppTextStyles.bodyMedium),
              ),
              data: (items) {
                if (items.isEmpty) {
                  return _EmptyVault();
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(vaultNotesProvider);
                    ref.invalidate(vaultStatsProvider);
                    await ref.read(vaultNotesProvider.future);
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (_, i) => _NoteCard(
                      note: items[i],
                      onDelete: () async {
                        try {
                          await ref
                              .read(apiServiceProvider)
                              .deleteVaultNote(items[i].id);
                          ref.invalidate(vaultNotesProvider);
                          ref.invalidate(vaultStatsProvider);
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Lỗi: $e')),
                            );
                          }
                        }
                      },
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _showCreateSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.backgroundCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _CreateVaultSheet(
        onCreate: (content, mood) async {
          try {
            await ref
                .read(apiServiceProvider)
                .createVaultNote(content: content, mood: mood.wire);
            ref.invalidate(vaultNotesProvider);
            ref.invalidate(vaultStatsProvider);
            if (context.mounted) Navigator.of(context).pop();
          } catch (e) {
            if (context.mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Lỗi: $e')),
              );
            }
          }
        },
      ),
    );
  }
}

class _StatsHeader extends StatelessWidget {
  final AsyncValue<VaultStats> stats;
  const _StatsHeader({required this.stats});

  @override
  Widget build(BuildContext context) {
    return stats.when(
      loading: () => const SizedBox(height: 56),
      error: (_, __) => const SizedBox.shrink(),
      data: (s) {
        Widget chip(String emoji, String label, int count) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(emoji, style: const TextStyle(fontSize: 24)),
                const SizedBox(height: 2),
                Text(count.toString(),
                    style: AppTextStyles.bodyMedium
                        .copyWith(fontWeight: FontWeight.w700)),
                Text(label, style: AppTextStyles.bodySmall),
              ],
            ),
          );
        }

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              chip('😊', 'Vui', 0),
              chip('😐', 'Bình thường', 0),
              chip('😢', 'Buồn', 0),
              chip('😠', 'Giận', 0),
            ],
          ),
        );
      },
    );
  }
}

class _EmptyVault extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_outline_rounded, size: 64, color: AppColors.textMuted),
          SizedBox(height: 12),
          Text('Hộp bí mật của bạn đang trống',
              style: AppTextStyles.bodyMedium),
          SizedBox(height: 4),
          Text('Hãy viết những suy nghĩ của bạn vào đây',
              style: AppTextStyles.bodySmall),
        ],
      ),
    );
  }
}

class _NoteCard extends StatelessWidget {
  final VaultNoteModel note;
  final VoidCallback onDelete;
  const _NoteCard({required this.note, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.backgroundCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(note.mood.emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 8),
              Text(note.mood.label, style: AppTextStyles.bodySmall),
              const Spacer(),
              Text(timeago.format(note.createdAt),
                  style: AppTextStyles.bodySmall
                      .copyWith(color: AppColors.textMuted)),
              IconButton(
                icon: const Icon(Icons.delete_outline_rounded,
                    color: AppColors.textMuted, size: 20),
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (_) => AlertDialog(
                      backgroundColor: AppColors.backgroundCard,
                      title: const Text('Xóa nhật ký?'),
                      content: const Text('Hành động này không thể hoàn tác.'),
                      actions: [
                        TextButton(
                            onPressed: () => Navigator.pop(context, false),
                            child: const Text('Hủy')),
                        FilledButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: const Text('Xóa')),
                      ],
                    ),
                  );
                  if (ok == true) onDelete();
                },
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(note.content, style: AppTextStyles.bodyMedium),
        ],
      ),
    );
  }
}

class _CreateVaultSheet extends StatefulWidget {
  final Future<void> Function(String content, VaultMood mood) onCreate;
  const _CreateVaultSheet({required this.onCreate});
  @override
  State<_CreateVaultSheet> createState() => _CreateVaultSheetState();
}

class _CreateVaultSheetState extends State<_CreateVaultSheet> {
  final _controller = TextEditingController();
  VaultMood _mood = VaultMood.neutral;
  bool _busy = false;
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Viết nhật ký', style: AppTextStyles.headingMedium),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: VaultMood.values
                .map((m) => ChoiceChip(
                      label: Text('${m.emoji} ${m.label}'),
                      selected: _mood == m,
                      onSelected: (_) => setState(() => _mood = m),
                    ))
                .toList(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _controller,
            maxLines: 6,
            decoration: const InputDecoration(
              hintText: 'Hôm nay của bạn thế nào?',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Spacer(),
              FilledButton.icon(
                onPressed: _busy
                    ? null
                    : () async {
                        final text = _controller.text.trim();
                        if (text.isEmpty) return;
                        setState(() => _busy = true);
                        await widget.onCreate(text, _mood);
                        if (mounted) setState(() => _busy = false);
                      },
                icon: const Icon(Icons.save_rounded, size: 18),
                label: const Text('Lưu'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
