import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'safe_image.dart';

/// Network-aware avatar that gracefully handles HTTP 429 (rate-limited
/// Google avatars) and any other loading failure by falling back to a
/// colored initial.
class SafeAvatar extends StatelessWidget {
  final String? imageUrl;
  final String? name;
  final double size;
  final BoxFit fit;

  const SafeAvatar({
    super.key,
    this.imageUrl,
    this.name,
    this.size = 40,
    this.fit = BoxFit.cover,
  });

  @override
  Widget build(BuildContext context) {
    final initial = (name == null || name!.isEmpty)
        ? '?'
        : name![0].toUpperCase();
    // Only attempt to render an image when we actually have a usable URL.
    // `isPlaceholderUrl` returns false for null/empty, so explicitly check
    // for non-empty here too — otherwise `CachedNetworkImage` crashes with
    // "Unexpected null value" when the URL is missing.
    final hasImage = imageUrl != null &&
        imageUrl!.isNotEmpty &&
        !isPlaceholderUrl(imageUrl);

    return SizedBox(
      width: size,
      height: size,
      child: ClipOval(
        child: hasImage
            ? CachedNetworkImage(
                imageUrl: imageUrl!,
                fit: fit,
                // Some image hosts (notably Google avatar CDN) require
                // explicit headers or they'll rate-limit with 429. We
                // also add a Referer so Google's CDN treats this as a
                // first-party request instead of a hotlink.
                httpHeaders: const {
                  'User-Agent':
                      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                  'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
                  'Referer': 'https://accounts.google.com/',
                },
                // Tight disk + memory cache so 429 responses get cached
                // briefly and aren't re-requested on every navigation.
                memCacheWidth: (size * 2).round(),
                memCacheHeight: (size * 2).round(),
                maxWidthDiskCache: 256,
                maxHeightDiskCache: 256,
                placeholder: (_, _) =>
                    _InitialFallback(initial: initial),
                errorWidget: (_, _, _) =>
                    _InitialFallback(initial: initial),
              )
            : _InitialFallback(initial: initial),
      ),
    );
  }
}

class _InitialFallback extends StatelessWidget {
  final String initial;
  const _InitialFallback({required this.initial});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFFF2E93), Color(0xFFFF8A56)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
