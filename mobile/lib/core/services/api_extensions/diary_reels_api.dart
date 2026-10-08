import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for Diary & Reels
extension DiaryReelsApiExtension on ApiService {
  
  // ============ DIARY ============
  
  /// POST /api/diary/encounters
  Future<Map<String, dynamic>> recordDiaryEncounter({
    required String encounterId,
    required String action, // 'view' | 'dismiss' | 'note'
    String? note,
  }) async {
    final body = <String, dynamic>{
      'encounterId': encounterId,
      'action': action,
    };
    if (note != null) body['note'] = note;
    
    final response = await client.post(
      Uri.parse('$baseUrl/diary/encounters'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Ghi nhận encounter thất bại', response.statusCode);
  }
  
  // ============ REELS ============

  /// GET /api/reels/explore
  ///
  /// The backend wraps the array in `{ items: [...] }` (see
  /// `src/app/api/reels/explore/route.ts`). We unwrap it here so callers
  /// get a plain `List<dynamic>` of reel-shaped maps.
  Future<List<dynamic>> exploreReels({String? cursor, int? limit}) async {
    final query = <String, String>{};
    if (cursor != null) query['cursor'] = cursor;
    if (limit != null) query['limit'] = limit.toString();
    final uri = Uri.parse('$baseUrl/reels/explore').replace(
      queryParameters: query.isEmpty ? null : query,
    );

    final response = await client.get(uri, headers: headers).timeout(
      ApiConstants.connectionTimeout,
    );

    if (response.statusCode == 200) {
      final decoded = json.decode(response.body);
      if (decoded is Map<String, dynamic> && decoded['items'] is List) {
        return decoded['items'] as List<dynamic>;
      }
      // Defensive: some older deployments might still return a bare
      // array — accept either shape so the player keeps working.
      if (decoded is List) return decoded;
      return const [];
    }
    throw ApiException('Không thể tải reels', response.statusCode);
  }

  /// GET /api/reels/mine — same `{ items: [...] }` envelope.
  Future<List<dynamic>> getMyReels({String? cursor, int? limit}) async {
    final query = <String, String>{};
    if (cursor != null) query['cursor'] = cursor;
    if (limit != null) query['limit'] = limit.toString();
    final uri = Uri.parse('$baseUrl/reels/mine').replace(
      queryParameters: query.isEmpty ? null : query,
    );

    final response = await client.get(uri, headers: headers).timeout(
      ApiConstants.connectionTimeout,
    );

    if (response.statusCode == 200) {
      final decoded = json.decode(response.body);
      if (decoded is Map<String, dynamic> && decoded['items'] is List) {
        return decoded['items'] as List<dynamic>;
      }
      if (decoded is List) return decoded;
      return const [];
    }
    throw ApiException('Không thể tải reels của tôi', response.statusCode);
  }

  /// POST /api/reels/[id]/unlock
  ///
  /// Returns the unlocked reel on success (`{ ok: true, reel: {...} }`).
  /// On 403/404 the body has `{ error: string }` — callers should fall
  /// back to a snack-bar message.
  Future<Map<String, dynamic>> unlockReel(String reelId) async {
    final response = await client.post(
      Uri.parse('$baseUrl/reels/$reelId/unlock'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);

    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Mở khoá reel thất bại', response.statusCode);
  }

  /// POST /api/interactions with `{ action: 'like', postId }`.
  ///
  /// The reels player uses this to toggle likes because the backend
  /// likes table is keyed by post_id (a reel *is* a post under the
  /// hood, see `src/app/api/reels/explore/route.ts`).
  /// Returns `{ liked: bool }` reflecting the new state.
  Future<Map<String, dynamic>> toggleReelLike(String reelId) async {
    final response = await client.post(
      Uri.parse('$baseUrl/interactions'),
      headers: headers,
      body: json.encode({'action': 'like', 'postId': reelId}),
    ).timeout(ApiConstants.connectionTimeout);

    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Like thất bại', response.statusCode);
  }
}
