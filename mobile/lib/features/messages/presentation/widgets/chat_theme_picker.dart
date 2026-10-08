import 'package:flutter/material.dart';

/// 16 chat themes matching `ChatSettingsModal.tsx` in web.
/// Each theme defines: gradient for "my" bubble, solid color for
/// "their" bubble, panel backgrounds, borders, text colors, accent.
@immutable
class ChatTheme {
  final String id;
  final String label;
  final List<Color> bubbleGradientColors; // for LinearGradient
  final Color theirBubbleBg;
  final Color theirBubbleText;
  final Color bg;
  final Color surface;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final Color accent;

  const ChatTheme({
    required this.id,
    required this.label,
    required this.bubbleGradientColors,
    required this.theirBubbleBg,
    required this.theirBubbleText,
    required this.bg,
    required this.surface,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.accent,
  });

  LinearGradient get bubbleGradient =>
      LinearGradient(colors: bubbleGradientColors, begin: Alignment.topLeft, end: Alignment.bottomRight);
}

const THEMES = <ChatTheme>[
  ChatTheme(
    id: 'pink-sunset',
    label: 'Hoàng hôn hồng',
    bubbleGradientColors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
    theirBubbleBg: Color(0xFF2A1A2E),
    theirBubbleText: Color(0xFFFCE7F3),
    bg: Color(0xFF0F0A14),
    surface: Color(0xFF1A1225),
    border: Color(0xFF2D1F3D),
    textPrimary: Color(0xFFFCE7F3),
    textSecondary: Color(0xFF9F7AEA),
    accent: Color(0xFFFF2E93),
  ),
  ChatTheme(
    id: 'purple-cosmic',
    label: 'Vũ trụ tím',
    bubbleGradientColors: [Color(0xFF7C3AED), Color(0xFFA855F7)],
    theirBubbleBg: Color(0xFF1E1440),
    theirBubbleText: Color(0xFFE9D5FF),
    bg: Color(0xFF0C0918),
    surface: Color(0xFF18102E),
    border: Color(0xFF2E2060),
    textPrimary: Color(0xFFE9D5FF),
    textSecondary: Color(0xFF8B5CF6),
    accent: Color(0xFF8B5CF6),
  ),
  ChatTheme(
    id: 'ocean-teal',
    label: 'Đại dương xanh',
    bubbleGradientColors: [Color(0xFF0EA5E9), Color(0xFF14B8A6)],
    theirBubbleBg: Color(0xFF0C2A35),
    theirBubbleText: Color(0xFFCFFAFE),
    bg: Color(0xFF061419),
    surface: Color(0xFF0D2229),
    border: Color(0xFF1A4050),
    textPrimary: Color(0xFFCFFAFE),
    textSecondary: Color(0xFF22D3EE),
    accent: Color(0xFF06B6D4),
  ),
  ChatTheme(
    id: 'golden-sun',
    label: 'Nắng vàng',
    bubbleGradientColors: [Color(0xFFD97706), Color(0xFFFBBF24)],
    theirBubbleBg: Color(0xFF2A1E08),
    theirBubbleText: Color(0xFFFEF3C7),
    bg: Color(0xFF110E04),
    surface: Color(0xFF1E1709),
    border: Color(0xFF3D2E12),
    textPrimary: Color(0xFFFEF3C7),
    textSecondary: Color(0xFFFBBF24),
    accent: Color(0xFFF59E0B),
  ),
  ChatTheme(
    id: 'neon-cyber',
    label: 'Cyber neon',
    bubbleGradientColors: [Color(0xFF06B6D4), Color(0xFF8B5CF6)],
    theirBubbleBg: Color(0xFF0C0A1F),
    theirBubbleText: Color(0xFFE0E7FF),
    bg: Color(0xFF06040F),
    surface: Color(0xFF0D0B1E),
    border: Color(0xFF1E1B40),
    textPrimary: Color(0xFFE0E7FF),
    textSecondary: Color(0xFF818CF8),
    accent: Color(0xFF06B6D4),
  ),
  ChatTheme(
    id: 'mint-fresh',
    label: 'Bạc hà tươi',
    bubbleGradientColors: [Color(0xFF059669), Color(0xFF34D399)],
    theirBubbleBg: Color(0xFF052E1A),
    theirBubbleText: Color(0xFFD1FAE5),
    bg: Color(0xFF03120D),
    surface: Color(0xFF052216),
    border: Color(0xFF0A3D2A),
    textPrimary: Color(0xFFD1FAE5),
    textSecondary: Color(0xFF6EE7B7),
    accent: Color(0xFF10B981),
  ),
  ChatTheme(
    id: 'rose-gold',
    label: 'Hồng gold',
    bubbleGradientColors: [Color(0xFFE11D48), Color(0xFFFB7185)],
    theirBubbleBg: Color(0xFF2A0A14),
    theirBubbleText: Color(0xFFFECDD3),
    bg: Color(0xFF110508),
    surface: Color(0xFF1E0B10),
    border: Color(0xFF3D1520),
    textPrimary: Color(0xFFFECDD3),
    textSecondary: Color(0xFFFB7185),
    accent: Color(0xFFF43F5E),
  ),
  ChatTheme(
    id: 'lavender-dream',
    label: 'Giấc mơ lavender',
    bubbleGradientColors: [Color(0xFF7C3AED), Color(0xFFC084FC)],
    theirBubbleBg: Color(0xFFF5F3FF),
    theirBubbleText: Color(0xFF3B0764),
    bg: Color(0xFFEDE9FE),
    surface: Color(0xFFFAF8FF),
    border: Color(0xFFDDD6FE),
    textPrimary: Color(0xFF3B0764),
    textSecondary: Color(0xFF7C3AED),
    accent: Color(0xFF8B5CF6),
  ),
  ChatTheme(
    id: 'midnight-blue',
    label: 'Đêm trong xanh',
    bubbleGradientColors: [Color(0xFF1E40AF), Color(0xFF3B82F6)],
    theirBubbleBg: Color(0xFF0C1A3A),
    theirBubbleText: Color(0xFFDBEAFE),
    bg: Color(0xFF040A14),
    surface: Color(0xFF0A1425),
    border: Color(0xFF162D50),
    textPrimary: Color(0xFFDBEAFE),
    textSecondary: Color(0xFF60A5FA),
    accent: Color(0xFF3B82F6),
  ),
  ChatTheme(
    id: 'sunset-orange',
    label: 'Hoàng hôn cam',
    bubbleGradientColors: [Color(0xFFEA580C), Color(0xFFFB923C)],
    theirBubbleBg: Color(0xFF2A1000),
    theirBubbleText: Color(0xFFFFEDD5),
    bg: Color(0xFF110800),
    surface: Color(0xFF1E0E00),
    border: Color(0xFF3D1C00),
    textPrimary: Color(0xFFFFEDD5),
    textSecondary: Color(0xFFFB923C),
    accent: Color(0xFFF97316),
  ),
  ChatTheme(
    id: 'berry-purple',
    label: 'Việt quất tím',
    bubbleGradientColors: [Color(0xFF6D28D9), Color(0xFFA855F7)],
    theirBubbleBg: Color(0xFF1E0B40),
    theirBubbleText: Color(0xFFEDE9FE),
    bg: Color(0xFF0C0618),
    surface: Color(0xFF160B28),
    border: Color(0xFF2A1560),
    textPrimary: Color(0xFFEDE9FE),
    textSecondary: Color(0xFFA855F7),
    accent: Color(0xFFA855F7),
  ),
  ChatTheme(
    id: 'spring-green',
    label: 'Xuân xanh mướt',
    bubbleGradientColors: [Color(0xFF047857), Color(0xFF10B981)],
    theirBubbleBg: Color(0xFF022C22),
    theirBubbleText: Color(0xFFD1FAE5),
    bg: Color(0xFF011510),
    surface: Color(0xFF022018),
    border: Color(0xFF044030),
    textPrimary: Color(0xFFD1FAE5),
    textSecondary: Color(0xFF34D399),
    accent: Color(0xFF10B981),
  ),
  ChatTheme(
    id: 'coral-reef',
    label: 'San hô',
    bubbleGradientColors: [Color(0xFFDC2626), Color(0xFFFB7185)],
    theirBubbleBg: Color(0xFF2A0509),
    theirBubbleText: Color(0xFFFECDD3),
    bg: Color(0xFF110204),
    surface: Color(0xFF1E0609),
    border: Color(0xFF3D0D12),
    textPrimary: Color(0xFFFECDD3),
    textSecondary: Color(0xFFFB7185),
    accent: Color(0xFFEF4444),
  ),
  ChatTheme(
    id: 'aurora',
    label: 'Cực quang',
    bubbleGradientColors: [
      Color(0xFF0D9488),
      Color(0xFF22D3EE),
      Color(0xFFA78BFA),
      Color(0xFFF472B6),
    ],
    theirBubbleBg: Color(0xFF0C1A20),
    theirBubbleText: Color(0xFFE0F2FE),
    bg: Color(0xFF04090E),
    surface: Color(0xFF0A1318),
    border: Color(0xFF14283A),
    textPrimary: Color(0xFFE0F2FE),
    textSecondary: Color(0xFF22D3EE),
    accent: Color(0xFF14B8A6),
  ),
  ChatTheme(
    id: 'charcoal',
    label: 'Than đá',
    bubbleGradientColors: [Color(0xFF374151), Color(0xFF6B7280)],
    theirBubbleBg: Color(0xFF1F2937),
    theirBubbleText: Color(0xFFF3F4F6),
    bg: Color(0xFF111827),
    surface: Color(0xFF1F2937),
    border: Color(0xFF374151),
    textPrimary: Color(0xFFF3F4F6),
    textSecondary: Color(0xFF9CA3AF),
    accent: Color(0xFF6B7280),
  ),
  ChatTheme(
    id: 'pure-white',
    label: 'Trắng thuần',
    bubbleGradientColors: [Color(0xFF93C5FD), Color(0xFFC4B5FD)],
    theirBubbleBg: Color(0xFFF3F4F6),
    theirBubbleText: Color(0xFF1F2937),
    bg: Color(0xFFFFFFFF),
    surface: Color(0xFFF9FAFB),
    border: Color(0xFFE5E7EB),
    textPrimary: Color(0xFF111827),
    textSecondary: Color(0xFF6B7280),
    accent: Color(0xFF6366F1),
  ),
];

ChatTheme themeFromId(String? id) {
  if (id == null) return THEMES.first;
  for (final t in THEMES) {
    if (t.id == id) return t;
  }
  return THEMES.first;
}
