import 'package:flutter/material.dart';
import 'package:pulo/core/theme/app_theme.dart';

class SwipeButtons extends StatelessWidget {
  final VoidCallback onPass;
  final VoidCallback onSpark;
  final VoidCallback onLike;

  const SwipeButtons({
    super.key,
    required this.onPass,
    required this.onSpark,
    required this.onLike,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Pass button
        _ActionButton(
          onTap: onPass,
          icon: Icons.close_rounded,
          iconColor: AppColors.textPrimary,
          size: 56,
          backgroundColor: AppColors.backgroundInput,
        ),
        const SizedBox(width: 20),
        // Spark button
        _ActionButton(
          onTap: onSpark,
          icon: Icons.bolt_rounded,
          iconColor: AppColors.textPrimary,
          size: 48,
          gradient: AppColors.secondaryGradient,
        ),
        const SizedBox(width: 20),
        // Like button
        _ActionButton(
          onTap: onLike,
          icon: Icons.favorite_rounded,
          iconColor: AppColors.textPrimary,
          size: 56,
          gradient: AppColors.primaryGradient,
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final VoidCallback onTap;
  final IconData icon;
  final Color iconColor;
  final double size;
  final Color? backgroundColor;
  final Gradient? gradient;

  const _ActionButton({
    required this.onTap,
    required this.icon,
    required this.iconColor,
    required this.size,
    this.backgroundColor,
    this.gradient,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          gradient: gradient,
          color: backgroundColor,
          borderRadius: BorderRadius.circular(size / 2),
          border: gradient == null && backgroundColor != null
              ? Border.all(
                  color: Colors.white.withOpacity(0.08),
                  width: 1,
                )
              : null,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.38),
              blurRadius: 12,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Icon(
          icon,
          color: iconColor,
          size: size * 0.43,
        ),
      ),
    );
  }
}
