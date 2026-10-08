import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/models/user_model.dart';
import '../../../../core/theme/app_theme.dart';

/// Information section under the stats grid.
///
/// Mirrors the web `InfoRow` list (birthday · location · occupation ·
/// education · relationship · gender · phone · website · hobbies).
class ProfileInfoSection extends StatelessWidget {
  final UserModel user;
  const ProfileInfoSection({super.key, required this.user});

  @override
  Widget build(BuildContext context) {
    final rows = <_InfoRowData>[];

    if (user.birthday != null) {
      final age = _ageFromBirthday(user.birthday!);
      rows.add(_InfoRowData(
        icon: Icons.cake_outlined,
        label: 'Sinh nhật',
        value: age != null ? '${_formatDate(user.birthday!)} ($age tuổi)' : _formatDate(user.birthday!),
      ));
    }
    if (user.location != null && user.location!.trim().isNotEmpty) {
      rows.add(_InfoRowData(
        icon: Icons.place_outlined,
        label: 'Địa điểm',
        value: user.location!,
      ));
    }
    if (user.occupation != null && user.occupation!.trim().isNotEmpty) {
      rows.add(_InfoRowData(
        icon: Icons.work_outline_rounded,
        label: 'Nghề nghiệp',
        value: user.occupation!,
      ));
    }
    if (user.education != null && user.education!.trim().isNotEmpty) {
      rows.add(_InfoRowData(
        icon: Icons.school_outlined,
        label: 'Học vấn',
        value: user.education!,
      ));
    }
    if (user.relationshipStatus != null &&
        user.relationshipStatus!.trim().isNotEmpty) {
      rows.add(_InfoRowData(
        icon: Icons.favorite_border_rounded,
        label: 'Tình trạng',
        value: _relationshipLabel(user.relationshipStatus!),
      ));
    }
    if (user.gender != null && user.gender!.trim().isNotEmpty) {
      rows.add(_InfoRowData(
        icon: Icons.person_outline_rounded,
        label: 'Giới tính',
        value: _genderLabel(user.gender!),
      ));
    }
    if (user.website != null && user.website!.trim().isNotEmpty) {
      rows.add(_InfoRowData(
        icon: Icons.link_rounded,
        label: 'Website',
        value: user.website!,
        isLink: true,
      ));
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Thông tin',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          if (rows.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text(
                'Chưa có thông tin',
                style: TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 13,
                ),
              ),
            )
          else
            Container(
              decoration: BoxDecoration(
                color: AppColors.backgroundElevated,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: Column(
                children: [
                  for (int i = 0; i < rows.length; i++) ...[
                    _InfoRow(row: rows[i]),
                    if (i < rows.length - 1)
                      Divider(
                        height: 1,
                        thickness: 1,
                        color: AppColors.borderLight.withOpacity(0.6),
                        indent: 16,
                        endIndent: 16,
                      ),
                  ],
                ],
              ),
            ),
          if (user.hobbies.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text(
              'Sở thích',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: user.hobbies
                  .map((h) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.backgroundInput,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: AppColors.borderLight.withOpacity(0.5),
                          ),
                        ),
                        child: Text(
                          '#$h',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  static String _formatDate(DateTime d) {
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }

  static int? _ageFromBirthday(DateTime d) {
    final now = DateTime.now();
    var age = now.year - d.year;
    if (now.month < d.month || (now.month == d.month && now.day < d.day)) {
      age--;
    }
    return age >= 0 && age < 150 ? age : null;
  }

  static String _relationshipLabel(String key) {
    switch (key) {
      case 'single':
        return 'Độc thân';
      case 'in_relationship':
        return 'Đang hẹn hò';
      case 'married':
        return 'Đã kết hôn';
      case 'complicated':
        return 'Phức tạp';
      case 'prefer_not_to_say':
        return 'Không muốn tiết lộ';
    }
    return key;
  }

  static String _genderLabel(String key) {
    switch (key) {
      case 'male':
        return 'Nam';
      case 'female':
        return 'Nữ';
      case 'other':
        return 'Khác';
      case 'prefer_not_to_say':
        return 'Không muốn tiết lộ';
    }
    return key;
  }
}

class _InfoRowData {
  final IconData icon;
  final String label;
  final String value;
  final bool isLink;
  const _InfoRowData({
    required this.icon,
    required this.label,
    required this.value,
    this.isLink = false,
  });
}

class _InfoRow extends StatelessWidget {
  final _InfoRowData row;
  const _InfoRow({required this.row});

  @override
  Widget build(BuildContext context) {
    final valueWidget = row.isLink
        ? InkWell(
            onTap: () async {
              final uri = Uri.tryParse(row.value);
              if (uri != null && await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
            child: Text(
              row.value,
              style: const TextStyle(
                fontSize: 14,
                color: AppColors.secondaryCyan,
                decoration: TextDecoration.underline,
                decorationColor: AppColors.secondaryCyan,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          )
        : Text(
            row.value,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.textPrimary,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.backgroundInput,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(row.icon, size: 16, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  row.label,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 2),
                valueWidget,
              ],
            ),
          ),
        ],
      ),
    );
  }
}
