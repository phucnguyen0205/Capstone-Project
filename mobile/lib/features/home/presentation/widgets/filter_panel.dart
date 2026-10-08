import 'package:flutter/material.dart';
import 'package:pulo/core/theme/app_theme.dart';
import 'package:pulo/core/constants/mock_data.dart';

class FilterPanel extends StatelessWidget {
  const FilterPanel({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.backgroundElevated.withOpacity(0.63),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Colors.white.withOpacity(0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Bộ lọc tìm kiếm',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          // Age filter
          _buildAgeFilter(),
          const SizedBox(height: 16),
          // Interests
          _buildInterests(),
        ],
      ),
    );
  }

  Widget _buildAgeFilter() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Độ tuổi',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
            Text(
              '${MockData.filterOptions['ageRange'][0]} - ${MockData.filterOptions['ageRange'][1]} tuổi',
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        // Slider
        Container(
          height: 6,
          decoration: BoxDecoration(
            color: AppColors.backgroundInput,
            borderRadius: BorderRadius.circular(3),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final range = 50 - 18; // Max age - Min age
              final startPercent = (18 - 18) / range;
              final endPercent = (25 - 18) / range;
              final left = constraints.maxWidth * startPercent;
              final width = constraints.maxWidth * (endPercent - startPercent);
              
              return Stack(
                children: [
                  Positioned(
                    left: left,
                    width: width,
                    top: 0,
                    bottom: 0,
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildInterests() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Sở thích',
          style: TextStyle(
            fontSize: 12,
            color: AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: MockData.interestChips.asMap().entries.map((entry) {
            final index = entry.key;
            final interest = entry.value;
            final isActive = index < 3;
            
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                gradient: isActive ? AppColors.primaryGradient : null,
                color: isActive ? null : AppColors.backgroundInput,
                borderRadius: BorderRadius.circular(100),
                border: isActive
                    ? null
                    : Border.all(
                        color: Colors.white.withOpacity(0.08),
                      ),
              ),
              child: Text(
                interest,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textPrimary,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }
}
