import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for Groups Advanced Features
extension GroupsAdvancedApiExtension on ApiService {
  
  // ============ GROUPS CRUD ============
  
  /// POST /api/groups
  Future<Map<String, dynamic>> createGroup({
    required String name,
    String? description,
    String? visibility, // 'public' | 'private'
    String? avatarUrl,
  }) async {
    final body = <String, dynamic>{'name': name};
    if (description != null) body['description'] = description;
    if (visibility != null) body['visibility'] = visibility;
    if (avatarUrl != null) body['avatarUrl'] = avatarUrl;
    
    final response = await client.post(
      Uri.parse('$baseUrl/groups'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Tạo nhóm thất bại', response.statusCode);
  }
  
  /// GET /api/groups/[id]
  Future<Map<String, dynamic>> getGroupDetail(String groupId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/$groupId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải thông tin nhóm', response.statusCode);
  }
  
  /// PATCH /api/groups/[id]
  Future<Map<String, dynamic>> updateGroup(
    String groupId, {
    String? name,
    String? description,
    String? avatarUrl,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (description != null) body['description'] = description;
    if (avatarUrl != null) body['avatarUrl'] = avatarUrl;
    
    final response = await client.patch(
      Uri.parse('$baseUrl/groups/$groupId'),
      headers: headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Cập nhật nhóm thất bại', response.statusCode);
  }
  
  /// DELETE /api/groups/[id]
  Future<void> deleteGroup(String groupId) async {
    final response = await client.delete(
      Uri.parse('$baseUrl/groups/$groupId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Xoá nhóm thất bại', response.statusCode);
    }
  }
  
  // ============ GROUP MEMBERSHIP ============
  
  /// POST /api/groups/[id]/join
  Future<Map<String, dynamic>> joinGroup(String groupId) async {
    final response = await client.post(
      Uri.parse('$baseUrl/groups/$groupId/join'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Tham gia nhóm thất bại', response.statusCode);
  }
  
  /// POST /api/groups/[id]/leave
  Future<void> leaveGroup(String groupId) async {
    final response = await client.post(
      Uri.parse('$baseUrl/groups/$groupId/leave'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Rời nhóm thất bại', response.statusCode);
    }
  }
  
  /// GET /api/groups/[id]/members
  Future<List<dynamic>> getGroupMembers(String groupId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/$groupId/members'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải thành viên nhóm', response.statusCode);
  }
  
  // ============ GROUP CONTENT ============
  
  /// GET /api/groups/[id]/activity
  Future<List<dynamic>> getGroupActivity(String groupId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/$groupId/activity'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải hoạt động nhóm', response.statusCode);
  }
  
  /// GET /api/groups/[id]/gallery
  Future<List<dynamic>> getGroupGallery(String groupId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/$groupId/gallery'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải gallery', response.statusCode);
  }
  
  /// GET /api/groups/[id]/posts
  Future<List<dynamic>> getGroupPosts(String groupId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/$groupId/posts'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Không thể tải bài đăng nhóm', response.statusCode);
  }
  
  /// POST /api/groups/[id]/posts
  /// Add existing post to group
  Future<Map<String, dynamic>> addPostToGroup(
    String groupId,
    String postId,
  ) async {
    final response = await client.post(
      Uri.parse('$baseUrl/groups/$groupId/posts'),
      headers: headers,
      body: json.encode({'postId': postId}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Thêm bài vào nhóm thất bại', response.statusCode);
  }
  
  /// POST /api/groups/[id]/transfer-ownership
  Future<void> transferGroupOwnership(
    String groupId,
    String newOwnerId,
  ) async {
    final response = await client.post(
      Uri.parse('$baseUrl/groups/$groupId/transfer-ownership'),
      headers: headers,
      body: json.encode({'newOwnerId': newOwnerId}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Chuyển quyền sở hữu thất bại', response.statusCode);
    }
  }
  
  // ============ GROUP DISCOVERY & CLOSENESS ============
  
  /// GET /api/groups/discover
  Future<List<dynamic>> discoverGroups({String? query, int limit = 20}) async {
    final qs = <String>[];
    if (query != null) qs.add('q=${Uri.encodeComponent(query)}');
    qs.add('limit=$limit');
    
    final response = await client.get(
      Uri.parse('$baseUrl/groups/discover?${qs.join('&')}'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as List<dynamic>;
    }
    throw ApiException('Khám phá nhóm thất bại', response.statusCode);
  }
  
  /// GET /api/groups/closeness
  Future<Map<String, dynamic>> getGroupCloseness() async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/closeness'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải closeness', response.statusCode);
  }
  
  /// GET /api/groups/closeness/[friendId]
  Future<Map<String, dynamic>> getFriendCloseness(String friendId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/groups/closeness/$friendId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải closeness', response.statusCode);
  }
}
