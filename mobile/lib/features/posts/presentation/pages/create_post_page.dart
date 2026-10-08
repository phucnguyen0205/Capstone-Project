import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/core_providers.dart';
import '../../../../core/providers/post_providers.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/theme/app_theme.dart';

/// Modal page for creating a new post. Lets the user pick a photo or
/// video, choose a lens (visibility) and write a caption. Mirrors the
/// web `PostModal` in feature parity.
class CreatePostPage extends ConsumerStatefulWidget {
  const CreatePostPage({super.key});

  @override
  ConsumerState<CreatePostPage> createState() => _CreatePostPageState();
}

class _CreatePostPageState extends ConsumerState<CreatePostPage> {
  final _captionCtrl = TextEditingController();
  CloudinaryUploadResult? _media;
  String _lens = 'friends'; // public | friends | close
  bool _busy = false;

  @override
  void dispose() {
    _captionCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppColors.backgroundCard,
        elevation: 0,
        title: const Text(
          'Tạo bài viết',
          style: TextStyle(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w800,
            fontSize: 16,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.close, color: AppColors.textPrimary),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          TextButton(
            onPressed: _busy || _media == null ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppColors.primaryPink,
                    ),
                  )
                : const Text(
                    'Đăng',
                    style: TextStyle(
                      color: AppColors.primaryPink,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                  ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildLensPicker(),
              const SizedBox(height: 20),
              _buildMediaPicker(),
              const SizedBox(height: 20),
              const Text(
                'Nội dung',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _captionCtrl,
                style: const TextStyle(color: AppColors.textPrimary),
                maxLines: 5,
                maxLength: 500,
                decoration: InputDecoration(
                  hintText: 'Chia sẻ khoảnh khắc của bạn...',
                  hintStyle: const TextStyle(color: AppColors.textMuted),
                  filled: true,
                  fillColor: AppColors.backgroundElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: AppColors.borderLight),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: AppColors.borderLight),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: AppColors.primaryPink),
                  ),
                  counterStyle:
                      const TextStyle(color: AppColors.textMuted, fontSize: 11),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLensPicker() {
    final options = const [
      ('public', '🌍 Công khai'),
      ('friends', '😄 Bè bạn'),
      ('close', '💜 Thân thiết'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Đối tượng',
          style: TextStyle(
            color: AppColors.textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: options
              .map((o) => _lensChip(o.$1, o.$2))
              .toList(),
        ),
      ],
    );
  }

  Widget _lensChip(String value, String label) {
    final active = _lens == value;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => setState(() => _lens = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryPink : AppColors.backgroundInput,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? AppColors.primaryPink : AppColors.borderLight,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? Colors.white : AppColors.textSecondary,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            fontSize: 13,
          ),
        ),
      ),
    );
  }

  Widget _buildMediaPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Ảnh / Video',
          style: TextStyle(
            color: AppColors.textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        AspectRatio(
          aspectRatio: 4 / 5,
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.backgroundElevated,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderLight),
            ),
            clipBehavior: Clip.hardEdge,
            child: _media != null
                ? Stack(
                    fit: StackFit.expand,
                    children: [
                      if (_media!.format == 'video' ||
                          _media!.url.toLowerCase().contains('.mp4'))
                        Container(
                          color: Colors.black,
                          child: const Center(
                            child: Icon(Icons.play_circle_outline_rounded,
                                color: Colors.white70, size: 64),
                          ),
                        )
                      else
                        CachedNetworkImage(
                          imageUrl: _media!.url,
                          fit: BoxFit.cover,
                        ),
                      Positioned(
                        right: 8,
                        top: 8,
                        child: IconButton(
                          icon: Container(
                            padding: const EdgeInsets.all(6),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.6),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.close,
                                size: 16, color: Colors.white),
                          ),
                          onPressed: () => setState(() => _media = null),
                        ),
                      ),
                    ],
                  )
                : Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.add_photo_alternate_outlined,
                          size: 56, color: AppColors.textMuted),
                      const SizedBox(height: 12),
                      Text(
                        'Chọn ảnh hoặc video',
                        style: AppTextStyles.bodyMedium
                            .copyWith(color: AppColors.textMuted),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.textPrimary,
                              side: const BorderSide(
                                  color: AppColors.borderLight),
                            ),
                            onPressed: _busy ? null : _pickImage,
                            icon: const Icon(Icons.image_outlined),
                            label: const Text('Ảnh'),
                          ),
                          const SizedBox(width: 12),
                          OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppColors.textPrimary,
                              side: const BorderSide(
                                  color: AppColors.borderLight),
                            ),
                            onPressed: _busy ? null : _pickVideo,
                            icon: const Icon(Icons.videocam_outlined),
                            label: const Text('Video'),
                          ),
                        ],
                      ),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  Future<void> _pickImage() async {
    setState(() => _busy = true);
    try {
      final upload = ref.read(uploadServiceProvider);
      final result = await upload.pickAndUploadImage(type: UploadType.image);
      setState(() => _media = result);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload ảnh thất bại: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickVideo() async {
    setState(() => _busy = true);
    try {
      final upload = ref.read(uploadServiceProvider);
      final result = await upload.pickAndUploadVideo(type: UploadType.video);
      setState(() => _media = result);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload video thất bại: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    final media = _media;
    if (media == null) return;
    setState(() => _busy = true);
    try {
      final api = ref.read(apiServiceProvider);
      final caption = _captionCtrl.text.trim();
      await api.createPost(
        mediaUrl: media.url,
        mediaType: media.format == 'video' ||
                media.url.toLowerCase().contains('.mp4')
            ? 'video'
            : 'image',
        caption: caption.isEmpty ? null : caption,
        lens: _lens,
        publicId: media.publicId,
      );
      // Invalidate every feed tab so the new post shows up on return.
      ref.invalidate(feedProvider);
      if (mounted) {
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đăng bài thất bại: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
