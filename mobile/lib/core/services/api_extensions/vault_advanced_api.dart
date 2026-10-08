import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for Vault Advanced Features
extension VaultAdvancedApiExtension on ApiService {
  
  // ============ VAULT NOTES ADVANCED ============
  
  /// PATCH /api/vault/notes/[id]
  Future<Map<String, dynamic>> updateVaultNote(
    String noteId, {
    String? content,
    String? mood,
    int? unlockPoints,
    String? visibility,
  }) async {
    final body = <String, dynamic>{};
    if (content != null) body['content'] = content;
    if (mood != null) body['mood'] = mood;
    if (unlockPoints != null) body['unlockPoints'] = unlockPoints;
    if (visibility != null) body['visibility'] = visibility;
    
    final response = await client.patch(
      Uri.parse('$baseUrl/vault/notes/$noteId'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Cập nhật note thất bại', response.statusCode);
  }
  
  /// GET /api/vault/notes/[id]/visibility
  Future<List<dynamic>> getNoteVisibilityList(String noteId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/vault/notes/$noteId/visibility'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải visibility list', response.statusCode);
  }
  
  /// PUT /api/vault/notes/[id]/visibility
  /// Add/update allow/deny override for a user
  Future<Map<String, dynamic>> updateNoteVisibility(
    String noteId, {
    required String userId,
    required String state, // 'allow' | 'deny'
    String? moodFilter, // 'happy' | 'sad' | 'angry' | 'neutral'
  }) async {
    final body = <String, dynamic>{
      'userId': userId,
      'state': state,
    };
    if (moodFilter != null) body['moodFilter'] = moodFilter;
    
    final response = await client.put(
      Uri.parse('$baseUrl/vault/notes/$noteId/visibility'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Cập nhật visibility thất bại', response.statusCode);
  }
  
  /// GET /api/vault/notes/[id]/visibility/preview
  /// Preview note visibility for current viewer
  Future<Map<String, dynamic>> previewNoteVisibility(String noteId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/vault/notes/$noteId/visibility/preview'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Preview thất bại', response.statusCode);
  }
  
  /// GET /api/vault/feed
  /// Feed of notes shared by friends (filtered by visibility)
  Future<List<dynamic>> getVaultFeed() async {
    final response = await client.get(
      Uri.parse('$baseUrl/vault/feed'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải vault feed', response.statusCode);
  }
  
  /// GET /api/vault/friends
  /// List of friends who can be granted access
  Future<List<dynamic>> getVaultFriends() async {
    final response = await client.get(
      Uri.parse('$baseUrl/vault/friends'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải danh sách bạn bè', response.statusCode);
  }
}
