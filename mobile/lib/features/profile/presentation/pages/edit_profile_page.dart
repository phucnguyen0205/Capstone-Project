import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/providers/providers.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/safe_image.dart';

class EditProfilePage extends ConsumerStatefulWidget {
  const EditProfilePage({super.key});

  @override
  ConsumerState<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends ConsumerState<EditProfilePage> {
  final _name = TextEditingController();
  final _username = TextEditingController();
  final _bio = TextEditingController();
  final _location = TextEditingController();
  final _occupation = TextEditingController();
  final _education = TextEditingController();
  final _website = TextEditingController();
  final _hobbies = TextEditingController();

  String? _avatarUrl;
  String? _coverUrl;
  String? _gender;
  String? _relationshipStatus;
  bool _saving = false;
  bool _initialized = false;

  @override
  void dispose() {
    _name.dispose();
    _username.dispose();
    _bio.dispose();
    _location.dispose();
    _occupation.dispose();
    _education.dispose();
    _website.dispose();
    _hobbies.dispose();
    super.dispose();
  }

  void _hydrateFromCurrent() {
    if (_initialized) return;
    final me = ref.read(currentUserProvider);
    if (me == null) return;
    _name.text = me.name;
    _username.text = me.username;
    _bio.text = me.bio ?? '';
    _location.text = me.location ?? '';
    _occupation.text = me.occupation ?? '';
    _education.text = me.education ?? '';
    _website.text = me.website ?? '';
    _hobbies.text = me.hobbies.join(', ');
    _gender = me.gender;
    _relationshipStatus = me.relationshipStatus;
    _avatarUrl = me.avatar;
    _coverUrl = me.coverPhoto;
    _initialized = true;
  }

  @override
  Widget build(BuildContext context) {
    _hydrateFromCurrent();
    return Scaffold(
      backgroundColor: AppColors.backgroundDark,
      appBar: AppBar(
        backgroundColor: AppColors.backgroundDark,
        elevation: 0,
        title: const Text('Chỉnh sửa hồ sơ', style: AppTextStyles.headingLarge),
        leading: IconButton(
          icon: const Icon(Icons.close_rounded, color: AppColors.textPrimary),
          onPressed: () => context.pop(),
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : _save,
            child: const Text('Lưu'),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Column(
          children: [
            _CoverPicker(
              url: _coverUrl,
              onPick: _pickCover,
            ),
            const SizedBox(height: 12),
            _AvatarPicker(
              url: _avatarUrl,
              onPick: _pickAvatar,
            ),
            const SizedBox(height: 24),
            _field(_name, 'Họ tên'),
            _field(_username, 'Username'),
            _field(_bio, 'Tiểu sử', maxLines: 4),
            _field(_location, 'Địa điểm'),
            _field(_occupation, 'Nghề nghiệp'),
            _field(_education, 'Học vấn'),
            _field(_website, 'Website'),
            _field(_hobbies, 'Sở thích (phân cách bằng dấu phẩy)'),
            const SizedBox(height: 12),
            _genderPicker(),
            const SizedBox(height: 12),
            _relationshipPicker(),
            const SizedBox(height: 32),
            if (_saving) const CircularProgressIndicator(strokeWidth: 2),
          ],
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        maxLines: maxLines,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  Widget _genderPicker() {
    final options = ['male', 'female', 'other', 'prefer_not_to_say'];
    final labels = {
      'male': 'Nam',
      'female': 'Nữ',
      'other': 'Khác',
      'prefer_not_to_say': 'Không muốn nói',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Giới tính', style: AppTextStyles.bodyMedium),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: options
              .map((g) => ChoiceChip(
                    label: Text(labels[g]!),
                    selected: _gender == g,
                    onSelected: (_) => setState(() => _gender = g),
                  ))
              .toList(),
        ),
      ],
    );
  }

  Widget _relationshipPicker() {
    const options = ['single', 'in_relationship', 'married', 'complicated'];
    const labels = {
      'single': 'Độc thân',
      'in_relationship': 'Đang hẹn hò',
      'married': 'Đã kết hôn',
      'complicated': 'Phức tạp',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Mối quan hệ', style: AppTextStyles.bodyMedium),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: options
              .map((s) => ChoiceChip(
                    label: Text(labels[s]!),
                    selected: _relationshipStatus == s,
                    onSelected: (_) => setState(() => _relationshipStatus = s),
                  ))
              .toList(),
        ),
      ],
    );
  }

  Future<void> _pickAvatar() async {
    try {
      final up = ref.read(uploadServiceProvider);
      final r = await up.pickAndUploadImage(type: UploadType.avatar);
      setState(() => _avatarUrl = r.url);
    } catch (e) {
      _toast('Lỗi: $e');
    }
  }

  Future<void> _pickCover() async {
    try {
      final up = ref.read(uploadServiceProvider);
      final r = await up.pickAndUploadImage(type: UploadType.cover);
      setState(() => _coverUrl = r.url);
    } catch (e) {
      _toast('Lỗi: $e');
    }
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      final patch = <String, dynamic>{
        'name': _name.text.trim(),
        'username': _username.text.trim(),
        'bio': _bio.text.trim(),
        'location': _location.text.trim(),
        'occupation': _occupation.text.trim(),
        'education': _education.text.trim(),
        'website': _website.text.trim(),
        'hobbies': _hobbies.text.trim(),
        if (_gender != null) 'gender': _gender,
        if (_relationshipStatus != null)
          'relationship_status': _relationshipStatus,
        if (_avatarUrl != null) 'avatar': _avatarUrl,
        if (_coverUrl != null) 'cover_photo': _coverUrl,
      };
      final api = ref.read(apiServiceProvider);
      await api.updateMe(patch);
      // Invalidate the currentUser provider so it re-fetches.
      ref.invalidate(meProvider);
      // Also update AuthService cached user (used elsewhere).
      final me = ref.read(currentUserProvider);
      final auth = ref.read(authServiceProvider).valueOrNull;
      if (auth != null && me != null) {
        await auth.setCurrentUser(me.toJson());
      }
      _toast('Đã lưu hồ sơ');
      if (mounted) context.pop();
    } catch (e) {
      _toast('Lỗi: $e');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

class _AvatarPicker extends StatelessWidget {
  final String? url;
  final VoidCallback onPick;
  const _AvatarPicker({required this.url, required this.onPick});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        children: [
          CircleAvatar(
            radius: 50,
            backgroundColor: AppColors.backgroundCard,
            backgroundImage: safeNetworkImage(url),
            child: (url == null || url!.isEmpty || isPlaceholderUrl(url))
                ? const Icon(Icons.person_rounded,
                    color: AppColors.textSecondary, size: 50)
                : null,
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Material(
              color: AppColors.primaryPink,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onPick,
                child: const Padding(
                  padding: EdgeInsets.all(8),
                  child: Icon(Icons.camera_alt_rounded,
                      size: 18, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverPicker extends StatelessWidget {
  final String? url;
  final VoidCallback onPick;
  const _CoverPicker({required this.url, required this.onPick});
  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 3,
      child: Stack(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: (url != null && url!.isNotEmpty)
                ? CachedNetworkImage(imageUrl: url!, fit: BoxFit.cover)
                : Container(
                    decoration:
                        const BoxDecoration(gradient: AppColors.primaryGradient),
                  ),
          ),
          Positioned(
            right: 8,
            bottom: 8,
            child: Material(
              color: Colors.black54,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onPick,
                child: const Padding(
                  padding: EdgeInsets.all(8),
                  child: Icon(Icons.camera_alt_rounded,
                      size: 18, color: Colors.white),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
