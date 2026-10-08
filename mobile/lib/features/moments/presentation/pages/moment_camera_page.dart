import 'dart:async';
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/providers/providers.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_avatar.dart';

/// Full-screen camera page for capturing a Khoảnh Khắc (Moment).
///
/// UX flow:
/// 1. Camera opens with a tap-to-shoot button and a library shortcut.
/// 2. After capture, user picks emoji overlay + caption + recipients.
/// 3. Upload to Cloudinary via UploadService.
/// 4. POST /api/moments with the chosen recipients.
class MomentCameraPage extends ConsumerStatefulWidget {
  const MomentCameraPage({super.key});

  @override
  ConsumerState<MomentCameraPage> createState() => _MomentCameraPageState();
}

class _MomentCameraPageState extends ConsumerState<MomentCameraPage> {
  String? _localPath;
  String? _mediaType;
  String? _caption;
  String? _emoji;
  Color? _emojiColor;
  final List<String> _recipientIds = [];
  bool _uploading = false;

  // Available emoji overlays (Locket-style)
  static const _emojiPalette = ['❤️', '🔥', '😂', '😮', '😢', '👍', '🎉', '✨'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Khoảnh khắc mới'),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: _localPath == null
          ? _buildCaptureView()
          : _buildEditorView(),
    );
  }

  Widget _buildCaptureView() {
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: Container(
              color: Colors.black,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.photo_camera_back_rounded,
                        size: 96, color: Colors.white24),
                    SizedBox(height: 12),
                    Text(
                      'Chạm để chụp hoặc chọn ảnh từ thư viện',
                      style: TextStyle(color: Colors.white70, fontSize: 14),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(24),
            color: Colors.black,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _CameraButton(
                  icon: Icons.photo_library_rounded,
                  label: 'Thư viện',
                  onTap: _pickFromGallery,
                ),
                GestureDetector(
                  onTap: _captureFromCamera,
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 4),
                    ),
                    child: Container(
                      margin: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 60),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEditorView() {
    final me = ref.watch(currentUserProvider);
    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: Container(
              color: Colors.black,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (_mediaType == 'image')
                    Image.network(_localPath!, fit: BoxFit.contain)
                  else if (_mediaType == 'video')
                    _LocalVideoPreview(path: _localPath!)
                  else
                    const SizedBox.shrink(),
                  if (_emoji != null)
                    Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: _emojiColor ?? Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(_emoji!, style: const TextStyle(fontSize: 32)),
                      ),
                    ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.5),
                        shape: BoxShape.circle,
                      ),
                      child: GestureDetector(
                        onTap: _retake,
                        child: const Icon(Icons.refresh_rounded,
                            color: Colors.white, size: 20),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Container(
            color: Colors.black,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Caption input
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: TextField(
                    style: const TextStyle(color: Colors.white),
                    cursorColor: Colors.white,
                    maxLines: 1,
                    maxLength: 80,
                    decoration: const InputDecoration(
                      hintText: 'Thêm chú thích (tuỳ chọn)',
                      hintStyle: TextStyle(color: Colors.white54),
                      border: InputBorder.none,
                      counterText: '',
                    ),
                    onChanged: (v) => _caption = v,
                  ),
                ),
                const SizedBox(height: 12),
                // Emoji palette
                const Text(
                  'Biểu cảm',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  height: 44,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _emojiPalette.length + 1,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) {
                      if (i == 0) {
                        return _EmojiChip(
                          emoji: '✕',
                          selected: _emoji == null,
                          onTap: () => setState(() => _emoji = null),
                        );
                      }
                      final e = _emojiPalette[i - 1];
                      return _EmojiChip(
                        emoji: e,
                        selected: _emoji == e,
                        onTap: () => setState(() {
                          _emoji = e;
                          _emojiColor = Colors.white.withValues(alpha: 0.2);
                        }),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 12),
                // Recipient picker
                _RecipientPicker(
                  me: me,
                  selected: _recipientIds,
                  onToggle: (uid) {
                    setState(() {
                      if (_recipientIds.contains(uid)) {
                        _recipientIds.remove(uid);
                      } else {
                        _recipientIds.add(uid);
                      }
                    });
                  },
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _uploading || _recipientIds.isEmpty ? null : _send,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primaryPink,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      disabledBackgroundColor:
                          AppColors.primaryPink.withValues(alpha: 0.4),
                    ),
                    child: _uploading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text(
                            _recipientIds.isEmpty
                                ? 'Chọn người nhận'
                                : 'Gửi đến ${_recipientIds.length} người',
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    try {
      final image = await picker.pickImage(source: ImageSource.gallery);
      if (image != null) {
        setState(() {
          _localPath = image.path;
          _mediaType = 'image';
        });
      }
    } catch (e) {
      _showError('Không thể chọn ảnh: $e');
    }
  }

  Future<void> _captureFromCamera() async {
    final picker = ImagePicker();
    try {
      final shot = await picker.pickImage(source: ImageSource.camera);
      if (shot != null) {
        setState(() {
          _localPath = shot.path;
          _mediaType = 'image';
        });
      }
    } catch (e) {
      _showError('Không thể chụp ảnh: $e');
    }
  }

  void _retake() {
    setState(() {
      _localPath = null;
      _mediaType = null;
      _caption = null;
      _emoji = null;
    });
  }

  Future<void> _send() async {
    if (_localPath == null || _recipientIds.isEmpty) return;
    setState(() => _uploading = true);
    try {
      // 1. Upload to Cloudinary
      final upload = ref.read(uploadServiceProvider);
      final result = await upload.uploadFile(
        filePath: _localPath!,
        filename: 'moment_${DateTime.now().millisecondsSinceEpoch}',
        type: _mediaType == 'video' ? UploadType.video : UploadType.image,
      );

      // 2. Persist the moment
      final api = ref.read(apiServiceProvider);
      final overlayColorHex = _emojiColor != null
          ? '#${_emojiColor!.value.toRadixString(16).padLeft(8, '0').substring(2)}'
          : null;
      await api.createMoment(
        mediaUrl: result.url,
        mediaType: _mediaType!,
        publicId: result.publicId,
        caption: _caption ?? '',
        overlayEmoji: _emoji,
        overlayColor: overlayColorHex,
        recipientIds: _recipientIds,
      );

      // 3. Refresh feed
      ref.invalidate(momentsFeedProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã gửi khoảnh khắc!')),
        );
        Navigator.of(context).pop();
      }
    } catch (e) {
      _showError('Gửi thất bại: $e');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }
}

class _CameraButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _CameraButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 26),
          ),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ],
      ),
    );
  }
}

class _EmojiChip extends StatelessWidget {
  final String emoji;
  final bool selected;
  final VoidCallback onTap;
  const _EmojiChip({
    required this.emoji,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primaryPink
              : Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: selected ? AppColors.primaryPink : Colors.white24,
            width: 1.5,
          ),
        ),
        alignment: Alignment.center,
        child: Text(emoji, style: const TextStyle(fontSize: 22)),
      ),
    );
  }
}

class _RecipientPicker extends ConsumerStatefulWidget {
  final UserModel? me;
  final List<String> selected;
  final void Function(String userId) onToggle;
  const _RecipientPicker({
    required this.me,
    required this.selected,
    required this.onToggle,
  });

  @override
  ConsumerState<_RecipientPicker> createState() => _RecipientPickerState();
}

class _RecipientPickerState extends ConsumerState<_RecipientPicker> {
  final TextEditingController _searchCtrl = TextEditingController();
  List<UserModel> _results = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  Future<void> _loadFriends() async {
    final me = widget.me;
    if (me == null) return;
    setState(() => _loading = true);
    try {
      final api = ref.read(apiServiceProvider);
      final raw = await api.getUserFriends(me.id, list: 'friends');
      _results = raw
          .whereType<Map<String, dynamic>>()
          .map(UserModel.fromJson)
          .toList();
    } catch (_) {
      _results = [];
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text('Gửi đến',
                style: TextStyle(color: Colors.white70, fontSize: 12)),
            const Spacer(),
            Text(
              '${widget.selected.length} đã chọn',
              style: const TextStyle(color: Colors.white54, fontSize: 11),
            ),
          ],
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 60,
          child: _loading
              ? const Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _results.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final u = _results[i];
                    final picked = widget.selected.contains(u.id);
                    return GestureDetector(
                      onTap: () => widget.onToggle(u.id),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Stack(
                            clipBehavior: Clip.none,
                            children: [
                              SafeAvatar(
                                imageUrl: u.avatar,
                                name: u.name,
                                size: 44,
                              ),
                              if (picked)
                                Positioned(
                                  right: -2,
                                  bottom: -2,
                                  child: Container(
                                    width: 18,
                                    height: 18,
                                    decoration: BoxDecoration(
                                      color: AppColors.primaryPink,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                          color: Colors.black, width: 2),
                                    ),
                                    child: const Icon(Icons.check_rounded,
                                        color: Colors.white, size: 12),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          SizedBox(
                            width: 50,
                            child: Text(
                              u.name.isNotEmpty
                                  ? u.name
                                  : '@${u.username}',
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 10),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _LocalVideoPreview extends StatefulWidget {
  final String path;
  const _LocalVideoPreview({required this.path});

  @override
  State<_LocalVideoPreview> createState() => _LocalVideoPreviewState();
}

class _LocalVideoPreviewState extends State<_LocalVideoPreview> {
  VideoPlayerController? _controller;

  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.file(File(widget.path))
      ..initialize().then((_) {
        if (mounted) setState(() {});
        _controller?.setLooping(true);
        _controller?.play();
      });
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null || !_controller!.value.isInitialized) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox(
        width: _controller!.value.size.width,
        height: _controller!.value.size.height,
        child: VideoPlayer(_controller!),
      ),
    );
  }
}