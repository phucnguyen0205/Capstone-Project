import 'package:flutter/material.dart';

class AppColors {
  // Primary gradient colors
  static const Color primaryPink = Color(0xFFFF2E93);
  static const Color primaryOrange = Color(0xFFFF8A56);
  
  // Secondary gradient colors
  static const Color secondaryCyan = Color(0xFF00E5FF);
  static const Color secondaryBlue = Color(0xFF0066FF);
  static const Color primaryPurple = Color(0xFF8B5CF6);
  
  // Background colors
  static const Color backgroundDark = Color(0xFF090A0C);
  static const Color backgroundCard = Color(0xFF111317);
  static const Color backgroundElevated = Color(0xFF171920);
  static const Color backgroundInput = Color(0xFF2A2D37);
  
  // Border colors
  static const Color borderLight = Color(0xFF242831);
  static const Color borderSubtle = Color(0xFF242831);
  
  // Text colors
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFFA0A5B5);
  static const Color textMuted = Color(0xFF626775);
  
  // Special colors
  static const Color accentBlue = Color(0xFF00E5FF);
  
  // Gradients
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [primaryPink, primaryOrange],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  
  static const LinearGradient secondaryGradient = LinearGradient(
    colors: [secondaryCyan, secondaryBlue],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

class AppTextStyles {
  static const TextStyle headingExtraBold = TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w800,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle headingLarge = TextStyle(
    fontSize: 20,
    fontWeight: FontWeight.w800,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle headingMedium = TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w800,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle titleBold = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle titleSemiBold = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodyRegular = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
  );

  static const TextStyle bodyMedium = TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle bodySmall = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: AppColors.textSecondary,
  );
  
  static const TextStyle caption = TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    color: AppColors.textSecondary,
  );
  
  static const TextStyle buttonBold = TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle tabActive = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w700,
    color: AppColors.textPrimary,
  );
  
  static const TextStyle tabInactive = TextStyle(
    fontSize: 15,
    fontWeight: FontWeight.w500,
    color: AppColors.textSecondary,
  );
}
