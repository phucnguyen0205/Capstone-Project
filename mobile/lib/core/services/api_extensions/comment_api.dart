import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for API endpoints related to Comments
extension CommentApiExtension on ApiService {
  
  // ============ COMMENT REACTIONS ============
  
  /// POST /api/posts/comments/[id]/reaction
  Future<Map<String, dynamic>> toggleCommentReaction(
    String commentId,
    String emoji,
  ) async {
    final response = await client.post(
      Uri.parse('$baseUrl/posts/comments/$commentId/reaction'),
      headers: headers,
      body: json.encode({'emoji': emoji}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Toggle reaction thất bại', response.statusCode);
  }
  
  /// GET /api/posts/comments/[id]/replies
  Future<List<dynamic>> getCommentReplies(String commentId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/posts/comments/$commentId/replies'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải replies', response.statusCode);
  }
  
  /// PATCH /api/posts/comments/[id]
  Future<Map<String, dynamic>> updateComment(
    String commentId,
    String content,
  ) async {
    final response = await client.patch(
      Uri.parse('$baseUrl/posts/comments/$commentId'),
      headers: headers,
      body: json.encode({'content': content}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Cập nhật comment thất bại', response.statusCode);
  }
  
  /// DELETE /api/posts/comments/[id]
  Future<void> deleteComment(String commentId) async {
    final response = await client.delete(
      Uri.parse('$baseUrl/posts/comments/$commentId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Xoá comment thất bại', response.statusCode);
    }
  }
  
  /// POST /api/posts/comments/[id]/report
  Future<void> reportComment(
    String commentId, {
    required String reason,
    String? description,
  }) async {
    final body = <String, dynamic>{'reason': reason};
    if (description != null) body['description'] = description;
    
    final response = await client.post(
      Uri.parse('$baseUrl/posts/comments/$commentId/report'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode != 200) {
      throw ApiException('Báo cáo comment thất bại', response.statusCode);
    }
  }
  
  /// POST /api/posts/comments/[id]/share
  Future<Map<String, dynamic>> shareComment(
    String commentId, {
    required String to, // friendId or groupId
  }) async {
    final response = await client.post(
      Uri.parse('$baseUrl/posts/comments/$commentId/share'),
      headers: headers,
      body: json.encode({'to': to}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Share comment thất bại', response.statusCode);
  }
}
