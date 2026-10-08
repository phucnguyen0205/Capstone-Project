import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';

export 'package:cached_network_image/cached_network_image.dart';

/// Common helpers used across widgets for image rendering.

/// Returns true when [url] looks like a placeholder / dummy asset
/// (example.com, w3.org, etc.) rather than a real user image.
/// Such URLs 404 in production and trigger noisy CORS errors in the
/// browser console, so callers should treat them as "no image".
bool isPlaceholderUrl(String? url) {
  if (url == null || url.isEmpty) return false;
  return url.contains('example.com') ||
      url.contains('w3.org') ||
      url.contains('placeholder') ||
      url.contains('picsum.photos');
}

/// Convenience wrapper for `CachedNetworkImageProvider` that swaps
/// placeholder URLs for `null` so the consumer can render a fallback
/// instead of trying to fetch a 404 image.
ImageProvider? safeNetworkImage(
  String? url, {
  Map<String, String>? headers,
}) {
  if (isPlaceholderUrl(url)) return null;
  if (url == null || url.isEmpty) return null;
  return CachedNetworkImageProvider(
    url,
    headers: headers ??
        const {
          'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
        },
  );
}
