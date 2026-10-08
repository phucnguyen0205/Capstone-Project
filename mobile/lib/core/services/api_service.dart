import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:flutter/foundation.dart';
import '../config/app_config.dart';
import '../constants/api_constants.dart';

// Import all API extensions
import 'api_extensions/api_extensions.dart';

class ApiService {
  final String baseUrl;
  final http.Client _client;
  String? _authToken;

  ApiService({String? baseUrl})
      : baseUrl = baseUrl ?? AppConfig.apiBaseUrl,
        _client = http.Client();

  // Shared token holder so the global instance and any other
  // ApiService instances (created in pages) all stay in sync.
  static String? _sharedToken;
  static String? get sharedToken => _sharedToken;
  static set sharedToken(String? value) {
    _sharedToken = value;
  }

  void setAuthToken(String? token) {
    _authToken = token;
    _sharedToken = token;
  }

  Map<String, String> get _headers {
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final token = _authToken ?? _sharedToken;
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }
  
  // Expose internal properties for extensions
  http.Client get client => _client;
  Map<String, String> get headers => _headers;

  // ============ AUTH ============
  
  Future<Map<String, dynamic>> signIn(String email, String password) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/auth/callback/credentials'),
        headers: _headers,
        body: json.encode({
          'email': email,
          'password': password,
          'csrfToken': '',
          'callbackUrl': '$baseUrl/api/auth/callback/credentials',
          'json': true,
        }),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body);
        return data;
      }
      throw ApiException('Đăng nhập thất bại', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi đăng nhập: $e');
    }
  }

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String name,
    String? username,
  }) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/auth/register'),
        headers: _headers,
        body: json.encode({
          'email': email,
          'password': password,
          'name': name,
          'username': username,
        }),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      }
      throw ApiException('Đăng ký thất bại', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi đăng ký: $e');
    }
  }

  Future<bool> sendOtp(String phone) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/auth/send-otp'),
        headers: _headers,
        body: json.encode({'phone': phone}),
      ).timeout(ApiConstants.connectionTimeout);
      
      return response.statusCode == 200;
    } catch (e) {
      throw ApiException('Không thể gửi OTP: $e');
    }
  }

  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/auth/verify-otp'),
        headers: _headers,
        body: json.encode({'phone': phone, 'otp': otp}),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw ApiException('Xác thực OTP thất bại', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi xác thực OTP: $e');
    }
  }

  // ============ DISCOVER / USERS ============
  
  Future<List<dynamic>> discoverUsers({String? search}) async {
    try {
      var url = '$baseUrl/discover';
      if (search != null && search.isNotEmpty) {
        url += '?search=${Uri.encodeComponent(search)}';
      }
      
      final response = await _client.get(
        Uri.parse(url),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body) as List<dynamic>;
      }
      throw ApiException('Không thể tải danh sách người dùng', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  /// Get profiles for swipe/discovery (legacy)
  Future<List<dynamic>> getProfiles() async {
    return discoverUsers();
  }

  /// Get trending videos/list (legacy)
  Future<List<dynamic>> getTrending() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/feed'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data is List) return data;
        if (data is Map && data['trending'] != null) return data['trending'] as List;
        return [];
      }
      throw ApiException('Không thể tải trending', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  /// Record swipe action (like/pass/superlike)
  Future<void> swipe(String targetUserId, String action) async {
    try {
      await _client.post(
        Uri.parse('$baseUrl/interactions'),
        headers: _headers,
        body: json.encode({
          'targetId': targetUserId,
          'type': action,
        }),
      ).timeout(ApiConstants.connectionTimeout);
    } catch (e) {
      debugPrint('Swipe error: $e');
    }
  }

  // ============ CONVERSATIONS & MESSAGES ============
  
  Future<List<dynamic>> getConversations() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/conversations'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body) as List<dynamic>;
      }
      throw ApiException('Không thể tải hội thoại', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  Future<Map<String, dynamic>> createConversation(String participantId) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/conversations'),
        headers: _headers,
        body: json.encode({'participantId': participantId}),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      }
      throw ApiException('Không thể tạo hội thoại', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi tạo hội thoại: $e');
    }
  }

  Future<List<dynamic>> getMessages(String conversationId) async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/conversations/$conversationId/messages'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body) as List<dynamic>;
      }
      throw ApiException('Không thể tải tin nhắn', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  Future<Map<String, dynamic>> sendMessage(String conversationId, String content) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/conversations/$conversationId/messages'),
        headers: _headers,
        body: json.encode({'content': content}),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      }
      throw ApiException('Không thể gửi tin nhắn', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi gửi tin nhắn: $e');
    }
  }

  Future<void> deleteMessage(String messageId) async {
    try {
      final response = await _client.delete(
        Uri.parse('$baseUrl/messages/$messageId'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode != 204 && response.statusCode != 200) {
        throw ApiException('Không thể xóa tin nhắn', response.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi xóa tin nhắn: $e');
    }
  }

  // ============ POSTS / FEED ============
  
  Future<List<dynamic>> getFeed({int page = 1, int limit = 20}) async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/posts?page=$page&limit=$limit'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data is List) return data;
        if (data is Map && data['posts'] != null) return data['posts'] as List;
        return [];
      }
      throw ApiException('Không thể tải bài đăng', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  Future<Map<String, dynamic>> createPost({
    required String mediaUrl,
    required String mediaType,
    String? caption,
    String lens = 'friends',
    String? publicId,
  }) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/posts'),
        headers: _headers,
        body: json.encode({
          'mediaUrl': mediaUrl,
          'mediaType': mediaType,
          'caption': caption,
          'lens': lens,
          'publicId': publicId,
        }),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      }
      throw ApiException('Không thể tạo bài đăng', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi tạo bài đăng: $e');
    }
  }

  Future<void> deletePost(String postId) async {
    try {
      final response = await _client.delete(
        Uri.parse('$baseUrl/posts/$postId'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode != 204 && response.statusCode != 200) {
        throw ApiException('Không thể xóa bài đăng', response.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi xóa bài đăng: $e');
    }
  }

  // ============ MOMENTS (KHOẢNH KHẮC — Locket-style) ============

  Future<List<dynamic>> getMoments() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/moments'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as List<dynamic>;
      }
      // The backend may not have implemented this endpoint yet — treat
      // 404 as "no moments" so the UI degrades gracefully instead of
      // logging a noisy error and breaking the build cycle.
      if (response.statusCode == 404) return <dynamic>[];
      throw ApiException('Không thể tải khoảnh khắc', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi tải khoảnh khắc: $e');
    }
  }

  Future<List<dynamic>> getReceivedMoments() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/moments/received'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as List<dynamic>;
      }
      if (response.statusCode == 404) return <dynamic>[];
      throw ApiException('Không thể tải khoảnh khắc đã nhận', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi tải khoảnh khắc đã nhận: $e');
    }
  }

  Future<List<dynamic>> getSentMoments() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/moments/sent'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as List<dynamic>;
      }
      if (response.statusCode == 404) return <dynamic>[];
      throw ApiException('Không thể tải khoảnh khắc đã gửi', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi tải khoảnh khắc đã gửi: $e');
    }
  }

  Future<Map<String, dynamic>> createMoment({
    required String mediaUrl,
    required String mediaType,
    String? publicId,
    String caption = '',
    String? overlayEmoji,
    String? overlayColor,
    required List<String> recipientIds,
  }) async {
    try {
      final body = <String, dynamic>{
        'mediaUrl': mediaUrl,
        'mediaType': mediaType,
        'caption': caption,
        'recipientIds': recipientIds,
      };
      if (publicId != null) body['publicId'] = publicId;
      if (overlayEmoji != null) body['overlayEmoji'] = overlayEmoji;
      if (overlayColor != null) body['overlayColor'] = overlayColor;

      final response = await _client.post(
        Uri.parse('$baseUrl/moments'),
        headers: _headers,
        body: json.encode(body),
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as Map<String, dynamic>;
      }
      throw ApiException('Không thể tạo khoảnh khắc', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi tạo khoảnh khắc: $e');
    }
  }

  Future<void> deleteMoment(String momentId) async {
    try {
      final response = await _client.delete(
        Uri.parse('$baseUrl/moments/$momentId'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode != 200 && response.statusCode != 204) {
        throw ApiException('Không thể xóa khoảnh khắc', response.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi xóa khoảnh khắc: $e');
    }
  }

  Future<Map<String, dynamic>> viewMoment(String momentId) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/moments/$momentId/view'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as Map<String, dynamic>;
      }
      throw ApiException('Không thể đánh dấu đã xem', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi đánh dấu đã xem: $e');
    }
  }

  Future<Map<String, dynamic>> reactMoment(String momentId, String type) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/moments/$momentId/react'),
        headers: _headers,
        body: json.encode({'type': type}),
      ).timeout(ApiConstants.connectionTimeout);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body) as Map<String, dynamic>;
      }
      throw ApiException('Không thể gửi cảm xúc', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi gửi cảm xúc: $e');
    }
  }

  Future<void> reportPost(String postId, String reason) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/posts/$postId/report'),
        headers: _headers,
        body: json.encode({'reason': reason}),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode != 200) {
        throw ApiException('Không thể báo cáo bài đăng', response.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi báo cáo: $e');
    }
  }

  Future<void> savePost(String postId) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/posts/$postId/save'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode != 200) {
        throw ApiException('Không thể lưu bài đăng', response.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi lưu bài đăng: $e');
    }
  }

  // ============ POST COMMENTS ============
  
  Future<List<dynamic>> getComments(String postId) async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/posts/$postId/comments'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body) as List<dynamic>;
      }
      throw ApiException('Không thể tải bình luận', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  Future<Map<String, dynamic>> addComment(String postId, String content) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/posts/$postId/comments'),
        headers: _headers,
        body: json.encode({'content': content}),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200 || response.statusCode == 201) {
        return json.decode(response.body);
      }
      throw ApiException('Không thể thêm bình luận', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi bình luận: $e');
    }
  }

  // ============ GROUPS ============
  
  Future<List<dynamic>> getGroups() async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/groups'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body) as List<dynamic>;
      }
      throw ApiException('Không thể tải nhóm', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  Future<List<dynamic>> getGroupFeed(String groupId, {int page = 1}) async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/groups/feed?groupId=$groupId&page=$page'),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body) as List<dynamic>;
      }
      throw ApiException('Không thể tải bài đăng nhóm', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi mạng: $e');
    }
  }

  // ============ AI MODERATION ============
  
  Future<Map<String, dynamic>> moderateContent(String caption, {String? imageUrl}) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/ai/moderate'),
        headers: _headers,
        body: json.encode({
          'caption': caption,
          'imageUrl': imageUrl,
        }),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw ApiException('Moderation failed', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Moderation error: $e');
    }
  }

  Future<Map<String, dynamic>> aiDiscover({String? search}) async {
    try {
      var url = '$baseUrl/ai/discover';
      if (search != null && search.isNotEmpty) {
        url += '?search=${Uri.encodeComponent(search)}';
      }
      
      final response = await _client.get(
        Uri.parse(url),
        headers: _headers,
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode == 200) {
        return json.decode(response.body);
      }
      throw ApiException('AI discover failed', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('AI discover error: $e');
    }
  }

  // ============ INTERACTIONS ============
  
  Future<void> recordInteraction(String targetId, String type) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/interactions'),
        headers: _headers,
        body: json.encode({
          'targetId': targetId,
          'type': type,
        }),
      ).timeout(ApiConstants.connectionTimeout);
      
      if (response.statusCode != 200) {
        throw ApiException('Failed to record interaction', response.statusCode);
      }
    } catch (e) {
      if (e is ApiException) rethrow;
      debugPrint('Interaction error: $e');
    }
  }

  // ============ PRESENCE ============

  Future<void> sendHeartbeat({bool isOnline = true}) async {
    try {
      await _client.post(
        Uri.parse('$baseUrl/presence/heartbeat'),
        headers: _headers,
        body: json.encode({'isOnline': isOnline}),
      ).timeout(const Duration(seconds: 10));
    } catch (e) {
      debugPrint('Heartbeat error: $e');
    }
  }

  /// Bulk presence lookup for a list of userIds. Returns a map of
  /// `userId -> { isOnline, lastActiveAt }`.
  Future<Map<String, dynamic>> getBulkPresence(List<String> userIds) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/presence/bulk'),
        headers: _headers,
        body: json.encode({'userIds': userIds}),
      ).timeout(const Duration(seconds: 10));
      if (response.statusCode == 200) {
        final body = json.decode(response.body);
        return body is Map<String, dynamic> ? body : {};
      }
      throw ApiException('Presence bulk failed', response.statusCode);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Lỗi presence: $e');
    }
  }

  // ============ USERS / PROFILE ============

  /// GET /api/users/me
  Future<Map<String, dynamic>> getMe() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/users/me'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải hồ sơ cá nhân', response.statusCode);
  }

  /// GET /api/users/:id (or :username)
  Future<Map<String, dynamic>> getUserById(String idOrUsername) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/users/$idOrUsername'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải hồ sơ người dùng', response.statusCode);
  }

  /// PATCH /api/users/me — updates editable profile fields.
  Future<Map<String, dynamic>> updateMe(Map<String, dynamic> patch) async {
    final response = await _client.patch(
      Uri.parse('$baseUrl/users/me'),
      headers: _headers,
      body: json.encode(patch),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể cập nhật hồ sơ', response.statusCode);
  }

  /// GET /api/users/search?q=
  Future<List<dynamic>> searchUsers(String query) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/users/search?q=${Uri.encodeComponent(query)}'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      if (data is Map && data['users'] is List) {
        return data['users'] as List;
      }
      return const [];
    }
    throw ApiException('Tìm kiếm thất bại', response.statusCode);
  }

  /// POST /api/users/:id/follow — follow another user.
  /// Returns the follow state returned by the backend.
  Future<Map<String, dynamic>> followUser(String userId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/users/$userId/follow'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Follow thất bại', response.statusCode);
  }

  /// PUT /api/users/:id/follow { action: 'accept' | 'reject' }
  Future<Map<String, dynamic>> respondFollow(
      String userId, String action) async {
    final response = await _client.put(
      Uri.parse('$baseUrl/users/$userId/follow'),
      headers: _headers,
      body: json.encode({'action': action}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Xử lý follow thất bại', response.statusCode);
  }

  /// DELETE /api/users/:id/follow
  Future<void> unfollowUser(String userId) async {
    final response = await _client.delete(
      Uri.parse('$baseUrl/users/$userId/follow'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Unfollow thất bại', response.statusCode);
    }
  }

  /// GET /api/users/:id/friends?list=
  Future<List<dynamic>> getUserFriends(
    String userId, {
    String list = 'friends', // 'friends' | 'followers' | 'following' | 'requests'
  }) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/users/$userId/friends?list=$list'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      if (data is Map && data[list] is List) return data[list] as List;
      return const [];
    }
    throw ApiException('Không thể tải danh sách bạn bè', response.statusCode);
  }

  /// GET /api/users/:id/posts
  Future<List<dynamic>> getUserPosts(String userId,
      {int page = 1, int limit = 20}) async {
    final response = await _client.get(
      Uri.parse(
          '$baseUrl/users/$userId/posts?page=$page&limit=$limit'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      if (data is Map && data['posts'] is List) {
        return data['posts'] as List;
      }
      return const [];
    }
    throw ApiException('Không thể tải bài đăng của người dùng',
        response.statusCode);
  }

  // ============ FEED (tab-aware) ============

  /// GET /api/feed?tab=for-you|following|public|friends
  Future<List<dynamic>> getTabbedFeed(String tab,
      {int limit = 20, int offset = 0}) async {
    final response = await _client.get(
      Uri.parse(
          '$baseUrl/feed?tab=${Uri.encodeComponent(tab)}&limit=$limit&offset=$offset'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      if (data is Map && data['posts'] is List) {
        return data['posts'] as List;
      }
      if (data is Map && data['items'] is List) {
        return data['items'] as List;
      }
      return const [];
    }
    throw ApiException('Không thể tải feed', response.statusCode);
  }

  // ============ POSTS — extra verbs ============

  /// PATCH /api/posts/:id — edit caption/lens (author only).
  Future<Map<String, dynamic>> updatePost(
    String postId, {
    String? caption,
    String? lens,
  }) async {
    final body = <String, dynamic>{};
    if (caption != null) body['caption'] = caption;
    if (lens != null) body['lens'] = lens;
    final response = await _client.patch(
      Uri.parse('$baseUrl/posts/$postId'),
      headers: _headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể cập nhật bài đăng', response.statusCode);
  }

  /// POST /api/posts/:id/like
  Future<Map<String, dynamic>> likePost(String postId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/posts/$postId/like'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Like thất bại', response.statusCode);
  }

  /// GET /api/posts/:id/like — returns { liked: bool, count: int }
  Future<Map<String, dynamic>> getLikeStatus(String postId) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/posts/$postId/like'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Lỗi tải trạng thái like', response.statusCode);
  }

  /// POST /api/posts/:id/share { type, targets? }
  Future<Map<String, dynamic>> sharePost(
    String postId, {
    required String type, // 'friend' | 'group' | 'copy'
    List<String>? targets,
  }) async {
    final body = <String, dynamic>{'type': type};
    if (targets != null) body['targets'] = targets;
    final response = await _client.post(
      Uri.parse('$baseUrl/posts/$postId/share'),
      headers: _headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Share thất bại', response.statusCode);
  }

  /// POST /api/posts/:id/hide — hide from feed or from specific users.
  Future<Map<String, dynamic>> hidePost(
    String postId, {
    String scope = 'feed', // 'feed' | 'users'
    List<String>? userIds,
  }) async {
    final body = <String, dynamic>{'scope': scope};
    if (userIds != null) body['userIds'] = userIds;
    final response = await _client.post(
      Uri.parse('$baseUrl/posts/$postId/hide'),
      headers: _headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Ẩn bài đăng thất bại', response.statusCode);
  }

  /// DELETE /api/posts/:id/hide?scope=&userId=
  Future<void> unhidePost(String postId,
      {String scope = 'feed', String? userId}) async {
    final qs = <String>[
      'scope=$scope',
      if (userId != null) 'userId=$userId',
    ].join('&');
    final response = await _client.delete(
      Uri.parse('$baseUrl/posts/$postId/hide?$qs'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Bỏ ẩn thất bại', response.statusCode);
    }
  }

  /// POST /api/posts/:id/dismiss — "see less from this author"
  Future<void> dismissAuthor(String postId) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/posts/$postId/dismiss'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Dismiss thất bại', response.statusCode);
    }
  }

  /// GET /api/posts/:id/comments — wraps list as a single map so caller
  /// can also access pagination metadata.
  Future<Map<String, dynamic>> getPostCommentsPage(
      String postId, int page) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/posts/$postId/comments?page=$page'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải bình luận', response.statusCode);
  }

  // ============ NOTIFICATIONS ============

  /// GET /api/notifications?limit=&offset=&unread=1
  Future<Map<String, dynamic>> getNotifications({
    int limit = 30,
    int offset = 0,
    bool onlyUnread = false,
  }) async {
    final qs = <String>[
      'limit=$limit',
      'offset=$offset',
      if (onlyUnread) 'unread=1',
    ].join('&');
    final response = await _client.get(
      Uri.parse('$baseUrl/notifications?$qs'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải thông báo', response.statusCode);
  }

  /// GET /api/notifications/unread-count
  Future<int> getUnreadNotificationCount() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/notifications/unread-count'),
      headers: _headers,
    ).timeout(const Duration(seconds: 10));
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is Map && data['count'] is num) {
        return (data['count'] as num).toInt();
      }
      if (data is Map && data['unreadCount'] is num) {
        return (data['unreadCount'] as num).toInt();
      }
      return 0;
    }
    return 0;
  }

  /// PATCH /api/notifications/:id { read: bool }
  Future<Map<String, dynamic>> setNotificationRead(
      String id, bool read) async {
    final response = await _client.patch(
      Uri.parse('$baseUrl/notifications/$id'),
      headers: _headers,
      body: json.encode({'read': read}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Cập nhật thông báo thất bại', response.statusCode);
  }

  /// DELETE /api/notifications/:id
  Future<void> deleteNotification(String id) async {
    final response = await _client.delete(
      Uri.parse('$baseUrl/notifications/$id'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Xóa thông báo thất bại', response.statusCode);
    }
  }

  /// POST /api/notifications/read-all
  Future<void> markAllNotificationsRead() async {
    final response = await _client.post(
      Uri.parse('$baseUrl/notifications/read-all'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Mark all read failed', response.statusCode);
    }
  }

  // ============ VAULT (private diary) ============

  /// GET /api/vault/notes
  Future<Map<String, dynamic>> getVaultNotes() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/vault/notes'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải nhật ký', response.statusCode);
  }

  /// POST /api/vault/notes
  Future<Map<String, dynamic>> createVaultNote({
    required String content,
    required String mood, // 'happy' | 'sad' | 'angry' | 'neutral'
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/vault/notes'),
      headers: _headers,
      body: json.encode({'content': content, 'mood': mood}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tạo nhật ký', response.statusCode);
  }

  /// DELETE /api/vault/notes/:id
  Future<void> deleteVaultNote(String id) async {
    final response = await _client.delete(
      Uri.parse('$baseUrl/vault/notes/$id'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Xóa nhật ký thất bại', response.statusCode);
    }
  }

  // ============ UPLOAD (Cloudinary) ============

  /// POST /api/upload/confirm — tells backend about a finished
  /// client-side Cloudinary upload. The actual upload to Cloudinary is
  /// done directly by the client (see `UploadService`).
  Future<Map<String, dynamic>> confirmUpload({
    required String publicId,
    required String url,
    required String type, // 'avatar' | 'image' | 'video' | 'cover'
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/upload/confirm'),
      headers: _headers,
      body: json.encode({'publicId': publicId, 'url': url, 'type': type}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Xác nhận upload thất bại', response.statusCode);
  }

  // ============ CALLS (signaling via HTTP + SSE listener elsewhere) ============

  /// POST /api/calls/initiate
  Future<Map<String, dynamic>> initiateCall({
    required String conversationId,
    required String calleeId,
    String? conversationName,
    bool isGroup = false,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/calls/initiate'),
      headers: _headers,
      body: json.encode({
        'conversationId': conversationId,
        'calleeId': calleeId,
        if (conversationName != null) 'conversationName': conversationName,
        'isGroup': isGroup,
      }),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return <String, dynamic>{};
      return json.decode(response.body) as Map<String, dynamic>;
    }
    if (response.statusCode == 409) {
      throw ApiException('Bạn đang có cuộc gọi khác đang hoạt động',
          response.statusCode);
    }
    throw ApiException('Không thể bắt đầu cuộc gọi', response.statusCode);
  }

  /// POST /api/calls/answer { callId, action }
  Future<Map<String, dynamic>> answerCall({
    required String callId,
    required String action, // 'accept' | 'decline' | 'end'
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/calls/answer'),
      headers: _headers,
      body: json.encode({'callId': callId, 'action': action}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return <String, dynamic>{};
      final body = json.decode(response.body);
      if (body is Map<String, dynamic>) return body;
      return <String, dynamic>{'data': body};
    }
    // 404 typically means the call already ended/expired on the server.
    // Surface a friendly message instead of "Xử lý cuộc gọi thất bại".
    if (response.statusCode == 404) {
      throw ApiException('Cuộc gọi đã kết thúc', response.statusCode);
    }
    // 409 means the callee is already on another call. Mirror the
    // initiate flow so the caller-side UI can show the same friendly
    // copy instead of a generic failure.
    if (response.statusCode == 409) {
      throw ApiException(
          'Bạn đang có cuộc gọi khác đang hoạt động', response.statusCode);
    }
    throw ApiException('Xử lý cuộc gọi thất bại', response.statusCode);
  }

  /// GET /api/calls/initiate — returns the active call (if any)
  Future<Map<String, dynamic>?> getActiveCall() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/calls/initiate'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final body = json.decode(response.body);
      if (body is Map<String, dynamic>) return body;
      return null;
    }
    return null;
  }

  /// POST /api/calls/signal — relay a WebRTC signaling message
  /// (offer / answer / ice / hangup) to the other peer.
  Future<void> sendSignal({
    required String callId,
    required String kind, // 'offer' | 'answer' | 'ice' | 'hangup'
    Map<String, dynamic>? payload,
  }) async {
    try {
      final response = await _client.post(
        Uri.parse('$baseUrl/calls/signal'),
        headers: _headers,
        body: json.encode({
          'callId': callId,
          'kind': kind,
          if (payload != null) 'payload': payload,
        }),
      ).timeout(const Duration(seconds: 5));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        if (kDebugMode) {
          debugPrint(
              '[api] signal $kind failed: ${response.statusCode} ${response.body}');
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[api] signal $kind error: $e');
    }
  }

  // ============ FRIEND REQUESTS (legacy compatibility) ============

  Future<Map<String, dynamic>> friendRequest({
    String? userId,
    String? requestId,
    required String action, // 'send' | 'accept' | 'decline' | 'cancel'
  }) async {
    final body = <String, dynamic>{'action': action};
    if (userId != null) body['userId'] = userId;
    if (requestId != null) body['requestId'] = requestId;
    final response = await _client.post(
      Uri.parse('$baseUrl/friend-request'),
      headers: _headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Friend request failed', response.statusCode);
  }

  // ============ GROUPS — extra ============

  Future<dynamic> getGroupsFeed({
    String? lens,
    int limit = 20,
    int offset = 0,
  }) async {
    final qs = <String>[
      if (lens != null) 'lens=${Uri.encodeComponent(lens)}',
      'limit=$limit',
      'offset=$offset',
    ].join('&');
    final response = await _client.get(
      Uri.parse('$baseUrl/groups/feed?$qs'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      if (response.body.isEmpty) return const <dynamic>[];
      // Backend returns either `{ items: [...] }` (or `posts`) or a
      // top-level JSON array. Either way, hand the raw decoded JSON to
      // the consumer and let it shape the data.
      return json.decode(response.body);
    }
    throw ApiException('Không thể tải feed nhóm', response.statusCode);
  }

  Future<List<dynamic>> getGroupsActivity() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/groups/activity'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      if (data is Map && data['items'] is List) return data['items'] as List;
      return const [];
    }
    throw ApiException('Không thể tải hoạt động nhóm', response.statusCode);
  }

  Future<List<dynamic>> getGroupMembers({int limit = 50, String? kind}) async {
    final qs = <String>[
      'limit=$limit',
      if (kind != null) 'kind=$kind',
    ].join('&');
    final response = await _client.get(
      Uri.parse('$baseUrl/groups/members?$qs'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      if (data is Map && data['members'] is List) {
        return data['members'] as List;
      }
      return const [];
    }
    throw ApiException('Không thể tải thành viên nhóm', response.statusCode);
  }

  Future<Map<String, dynamic>> getGroupTiers() async {
    final response = await _client.get(
      Uri.parse('$baseUrl/groups/tiers'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải tiers', response.statusCode);
  }

  // ============ CONVERSATIONS — extras ============

  /// Create a group conversation. Matches
  /// `POST /api/conversations` with `{ name, participantIds[] }`.
  Future<Map<String, dynamic>> createGroupConversation({
    required String name,
    required List<String> participantIds,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/conversations'),
      headers: _headers,
      body: json.encode({'name': name, 'participantIds': participantIds}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    }
    throw ApiException('Không thể tạo nhóm chat', response.statusCode);
  }

  /// Rename a conversation (PATCH /api/conversations/[id]).
  Future<Map<String, dynamic>> renameConversation(
      String conversationId, String name) async {
    final response = await _client.patch(
      Uri.parse('$baseUrl/conversations/$conversationId'),
      headers: _headers,
      body: json.encode({'name': name}),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      return json.decode(response.body);
    }
    throw ApiException('Đổi tên thất bại', response.statusCode);
  }

  /// Leave / delete a conversation (DELETE /api/conversations/[id]).
  Future<void> deleteConversation(String conversationId) async {
    final response = await _client.delete(
      Uri.parse('$baseUrl/conversations/$conversationId'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Không thể rời cuộc trò chuyện', response.statusCode);
    }
  }

  /// Send a message with optional media (Cloudinary URL). Mirrors
  /// `POST /api/conversations/[id]/messages`.
  Future<Map<String, dynamic>> sendMessageWithMedia(
    String conversationId, {
    required String content,
    String? mediaUrl,
    String? mediaType,
    String? fileName,
    int? fileSize,
  }) async {
    final body = <String, dynamic>{'content': content};
    if (mediaUrl != null) body['mediaUrl'] = mediaUrl;
    if (mediaType != null) body['mediaType'] = mediaType;
    if (fileName != null) body['fileName'] = fileName;
    if (fileSize != null) body['fileSize'] = fileSize;
    final response = await _client.post(
      Uri.parse('$baseUrl/conversations/$conversationId/messages'),
      headers: _headers,
      body: json.encode(body),
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(response.body);
    }
    throw ApiException('Không thể gửi tin nhắn', response.statusCode);
  }

  /// Search messages in a conversation (used by chat settings modal).
  Future<List<dynamic>> searchConversationMessages(
      String conversationId, String query) async {
    final response = await _client.get(
      Uri.parse(
          '$baseUrl/conversations/$conversationId/messages?q=${Uri.encodeComponent(query)}'),
      headers: _headers,
    ).timeout(ApiConstants.connectionTimeout);
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      if (data is List) return data;
      return const [];
    }
    throw ApiException('Tìm kiếm tin nhắn thất bại', response.statusCode);
  }

  // ============ CLOUDINARY DIRECT UPLOAD ============

  /// Upload a single file to Cloudinary unsigned preset (same as web).
  /// Returns the secure URL. `kind` selects resource type:
  /// `image`, `video`, or `raw` (everything else).
  Future<String> uploadFileToCloudinary(
    File file, {
    String kind = 'image',
  }) async {
    const cloudName = 'dibicwvqv';
    const uploadPreset = 'diary_upload';
    final resourceType = switch (kind) {
      'image' => 'image',
      'video' => 'video',
      _ => 'raw',
    };
    final uri = Uri.parse(
        'https://api.cloudinary.com/v1_1/$cloudName/$resourceType/upload');
    final req = http.MultipartRequest('POST', uri)
      ..fields['upload_preset'] = uploadPreset
      ..files.add(await http.MultipartFile.fromPath(
        'file',
        file.path,
        contentType: kind == 'image'
            ? MediaType('image', 'jpeg')
            : kind == 'video'
                ? MediaType('video', 'mp4')
                : MediaType('application', 'octet-stream'),
      ));
    final streamed = await req.send().timeout(const Duration(seconds: 60));
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode != 200) {
      throw ApiException('Upload thất bại', res.statusCode);
    }
    final data = json.decode(res.body) as Map<String, dynamic>;
    return (data['secure_url'] ?? data['url']) as String;
  }

  // ============ FRIEND REQUESTS (for AddMemberModal) ============

  /// Send a friend request (used by Add Member modal). Wraps the
  /// `POST /api/friend-request` endpoint.
  Future<Map<String, dynamic>> sendFriendRequest(String userId) async {
    return friendRequest(userId: userId, action: 'send');
  }

  void dispose() {
    _client.close();
  }
}

class ApiException implements Exception {
  final String message;
  final int? statusCode;

  ApiException(this.message, [this.statusCode]);

  @override
  String toString() => statusCode != null 
      ? 'ApiException: $message (Status: $statusCode)'
      : 'ApiException: $message';
}
