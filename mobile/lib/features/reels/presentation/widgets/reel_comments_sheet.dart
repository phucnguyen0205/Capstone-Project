import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/api_constants.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/providers/reel_comments_provider.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';

/// Bottom-sheet comments panel for the reels player. Mirrors the web
/// `ReelCommentsPanel` (`src/components/groups/ReelCommentsPanel.tsx`)
/// so the same UX rules apply on both platforms.
///
/// Behaviour:
///   * Loads flat list via `reelCommentsProvider` (family on postId).
///   * Top-level rows are filterable for deleted; replies live nested
///     under their parent.
///   * Composer supports one-level replies via `parentId`.
///   * Submitting calls `addComment` on the underlying ApiService which
///     posts to `/api/posts/[id]/comments`. The freshly returned comment
///     is inserted optimistically so the UI updates without a refetch.
class ReelCommentsSheet extends ConsumerStatefulWidget {
  final String postId;
  const ReelCommentsSheet({super.key, required this.postId});

  @override
  ConsumerState<ReelCommentsSheet> createState() => _ReelCommentsSheetState();
}

class _ReelCommentsSheetState extends ConsumerState<ReelCommentsSheet> {
  final TextEditingController _draft = TextEditingController();
  final FocusNode _draftFocus = FocusNode();

  /// While the comments list is being refreshed in-place (after we
  /// POST a new comment), we keep the panel mounted so the user keeps
  /// their draft + scroll position.
  bool _submitting = false;
  ReelComment? _replyTo;

  @override
  void dispose() {
    _draft.dispose();
    _draftFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final content = _draft.text.trim();
    if (content.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    final api = ref.read(apiServiceProvider);
    try {
      final response = await api.client.post(
        Uri.parse('${api.baseUrl}/posts/${widget.postId}/comments'),
        headers: api.headers,
        body: jsonEncode({
          'content': content,
          if (_replyTo != null) 'parentId': _replyTo!.id,
        }),
      ).timeout(ApiConstants.connectionTimeout);

      if (response.statusCode == 200 || response.statusCode == 201) {
        // The endpoint returns the new comment as JSON. Refresh the
        // family so we get a consistent server-side ordering.
        _draft.clear();
        setState(() => _replyTo = null);
        ref.invalidate(reelCommentsProvider(widget.postId));
      }
    } catch (_) {
      // Best-effort: a snack bar in the reels page handles re-save
      // prompts so we deliberately swallow the exception here.
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final commentsAsync = ref.watch(reelCommentsProvider(widget.postId));
    final mediaQuery = MediaQuery.of(context);

    return Padding(
      // Keep the sheet above the iOS home indicator on notched devices.
      padding: EdgeInsets.only(bottom: mediaQuery.viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: Container(
          height: mediaQuery.size.height * 0.78,
          decoration: const BoxDecoration(
            color: Color(0xFF0C0C14),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            children: [
              _Header(
                count: commentsAsync.maybeWhen(
                  data: (list) => list
                      .where((c) => c.parentId == null && !c.deleted)
                      .length,
                  orElse: () => 0,
                ),
                onClose: () => Navigator.of(context).pop(),
              ),
              Expanded(
                child: commentsAsync.when(
                    loading: () => const Center(
                          child: CircularProgressIndicator(
                            color: AppColors.primaryPink,
                          ),
                        ),
                    error: (e, _) => Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              'Không tải được bình luận\n$e',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ),
                    data: (comments) {
                      final topLevel = comments
                          .where((c) => c.parentId == null && !c.deleted)
                          .toList(growable: false);
                      if (topLevel.isEmpty) {
                        return const _EmptyState();
                      }
                      return ListView.builder(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        itemCount: topLevel.length,
                        itemBuilder: (_, i) {
                          final parent = topLevel[i];
                          final replies = comments
                              .where((c) =>
                                  c.parentId == parent.id && !c.deleted)
                              .toList(growable: false);
                          return _CommentTile(
                            comment: parent,
                            replies: replies,
                            onReply: () {
                              setState(() => _replyTo = parent);
                              _draftFocus.requestFocus();
                            },
                          );
                        },
                      );
                    },
                  ),
              ),
              _Composer(
                controller: _draft,
                focusNode: _draftFocus,
                submitting: _submitting,
                replyTo: _replyTo,
                onCancelReply: () => setState(() => _replyTo = null),
                onSubmit: _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final int count;
  final VoidCallback onClose;
  const _Header({required this.count, required this.onClose});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFF1F2028))),
      ),
      child: Row(
        children: [
          Expanded(
            child: Center(
              child: Text(
                '$count bình luận',
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          IconButton(
            onPressed: onClose,
            icon: const Icon(Icons.close_rounded,
                color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.chat_bubble_outline_rounded,
                color: AppColors.textMuted, size: 36),
            SizedBox(height: 12),
            Text(
              'Chưa có bình luận nào',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Hãy là người đầu tiên bình luận về video này.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  final ReelComment comment;
  final List<ReelComment> replies;
  final VoidCallback onReply;
  const _CommentTile({
    required this.comment,
    required this.replies,
    required this.onReply,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CommentRow(comment: comment, onReply: onReply),
          if (replies.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 36, top: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final reply in replies)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: _CommentRow(comment: reply, onReply: () {}),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CommentRow extends StatelessWidget {
  final ReelComment comment;
  final VoidCallback onReply;
  const _CommentRow({required this.comment, required this.onReply});

  String _timeAgo(DateTime t) {
    final delta = DateTime.now().difference(t);
    if (delta.inSeconds < 60) return 'Vừa xong';
    if (delta.inMinutes < 60) return '${delta.inMinutes} phút';
    if (delta.inHours < 24) return '${delta.inHours} giờ';
    if (delta.inDays < 7) return '${delta.inDays} ngày';
    return '${t.day.toString().padLeft(2, '0')}/${t.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final name = comment.author.displayName;
    return InkWell(
      onTap: onReply,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SafeAvatar(
              imageUrl: comment.author.avatar,
              name: name,
              size: 32,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _timeAgo(comment.createdAt),
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    comment.content,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 4),
                  GestureDetector(
                    onTap: onReply,
                    child: const Text(
                      'Trả lời',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool submitting;
  final ReelComment? replyTo;
  final VoidCallback onCancelReply;
  final VoidCallback onSubmit;
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.submitting,
    required this.replyTo,
    required this.onCancelReply,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: const BoxDecoration(
        color: Color(0xFF0C0C14),
        border: Border(top: BorderSide(color: Color(0xFF1F2028))),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (replyTo != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Đang trả lời @${replyTo!.author.username}',
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  GestureDetector(
                    onTap: onCancelReply,
                    child: const Icon(Icons.close_rounded,
                        size: 14, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  focusNode: focusNode,
                  enabled: !submitting,
                  minLines: 1,
                  maxLines: 3,
                  maxLength: 1000,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => onSubmit(),
                  decoration: InputDecoration(
                    counterText: '',
                    hintText: replyTo != null
                        ? 'Trả lời @${replyTo!.author.username}…'
                        : 'Thêm bình luận…',
                    hintStyle: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 13,
                    ),
                    filled: true,
                    fillColor: const Color(0xFF1A1B22),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                  ),
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppColors.primaryGradient,
                ),
                child: Material(
                  color: Colors.transparent,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: submitting ? null : onSubmit,
                    child: const Icon(
                      Icons.send_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Helper to launch the comments sheet for [postId] from any widget.
/// Centralises the showModalBottomSheet plumbing so callers don't
/// repeat the route name / animation defaults.
Future<void> showReelCommentsSheet(BuildContext context, String postId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.55),
    useSafeArea: false,
    builder: (_) => ReelCommentsSheet(postId: postId),
  );
}