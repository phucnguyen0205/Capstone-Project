import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for Conversation Member Management
extension ConversationMemberApiExtension on ApiService {

  // ============ CONVERSATION MEMBERS ============

  /// GET /api/conversations/[id]/members
  ///
  /// Returns the list of members. NOTE: the backend's GET handler for
  /// `/api/conversations/[id]/members` is NOT a separate route — the
  /// member list is embedded in `GET /api/conversations` (`participants`
  /// array) and `GET /api/conversations/[id]` (single conversation with
  /// participants). When the chat page opens, the conversation object
  /// is already in `conversationsProvider` — read it from there.
  ///
  /// We keep this method for compatibility with code that still calls
  /// it, but it expects the conversation payload (with `participants`)
  /// not a flat members endpoint.
  Future<List<dynamic>> getConversationMembers(String conversationId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/conversations/$conversationId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);

    if (response.statusCode == 200) {
      final body = json.decode(response.body) as Map<String, dynamic>;
      return (body['participants'] as List<dynamic>? ?? const []);
    }
    throw ApiException('Không thể tải thành viên', response.statusCode);
  }

  /// POST /api/conversations/[id]/members
  /// Add a member to group conversation (admin/creator only).
  /// Body: { userId: string }
  Future<Map<String, dynamic>> addConversationMember(
    String conversationId, {
    required String userId,
  }) async {
    final body = <String, dynamic>{'userId': userId};

    final response = await client.post(
      Uri.parse('$baseUrl/conversations/$conversationId/members'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);

    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Thêm thành viên thất bại', response.statusCode);
  }

  /// PATCH /api/conversations/[id]/members/[userId]
  /// Update a single member (nickname and/or role). Admin/creator only.
  /// Body: { role?: "admin" | "member", nickname?: string | null }
  ///
  /// IMPORTANT: the userId is in the URL path on the backend, NOT in
  /// the body. Earlier mobile code put it in the body and PATCHed the
  /// collection URL — both were wrong.
  Future<Map<String, dynamic>> updateConversationMember(
    String conversationId, {
    required String userId,
    String? nickname,
    String? role,
  }) async {
    final body = <String, dynamic>{};
    if (nickname != null) body['nickname'] = nickname;
    if (role != null) body['role'] = role;

    final response = await client.patch(
      Uri.parse('$baseUrl/conversations/$conversationId/members/$userId'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);

    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Cập nhật thành viên thất bại', response.statusCode);
  }

  /// DELETE /api/conversations/[id]/members/[userId]
  /// Kick a member from group (admin/creator only).
  Future<void> removeConversationMember(
    String conversationId,
    String userId,
  ) async {
    final response = await client.delete(
      Uri.parse('$baseUrl/conversations/$conversationId/members/$userId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);

    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Xoá thành viên thất bại', response.statusCode);
    }
  }

  /// Convenience: change just a member's nickname (admin-only).
  /// Pass null to clear the nickname.
  Future<Map<String, dynamic>> setMemberNickname(
    String conversationId, {
    required String userId,
    required String? nickname,
  }) =>
      updateConversationMember(
        conversationId,
        userId: userId,
        nickname: nickname,
      );

  /// Convenience: change a member's role (admin-only).
  Future<Map<String, dynamic>> setMemberRole(
    String conversationId, {
    required String userId,
    required String role, // 'admin' | 'member'
  }) =>
      updateConversationMember(
        conversationId,
        userId: userId,
        role: role,
      );
}