import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for Calls v2 (Socket.IO + Redis)
extension CallsV2ApiExtension on ApiService {
  
  // ============ CALLS V2 (Modern Socket.IO) ============
  
  /// POST /api/calls/v2/initiate
  Future<Map<String, dynamic>> initiateCallV2({
    required String conversationId,
    required String calleeId,
    required String calleeName,
    required String calleeAvatar,
    String? conversationName,
    bool isGroup = false,
  }) async {
    final response = await client.post(
      Uri.parse('$baseUrl/calls/v2/initiate'),
      headers: headers,
      body: json.encode({
        'conversationId': conversationId,
        'calleeId': calleeId,
        'calleeName': calleeName,
        'calleeAvatar': calleeAvatar,
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
    throw ApiException('Không thể bắt đầu cuộc gọi v2', response.statusCode);
  }
  
  /// POST /api/calls/v2/answer
  Future<Map<String, dynamic>> answerCallV2({
    required String callId,
    required String action, // 'accept' | 'decline' | 'end'
  }) async {
    final response = await client.post(
      Uri.parse('$baseUrl/calls/v2/answer'),
      headers: headers,
      body: json.encode({'callId': callId, 'action': action}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return <String, dynamic>{};
      final body = json.decode(response.body);
      if (body is Map<String, dynamic>) return body;
      return <String, dynamic>{'data': body};
    }
    if (response.statusCode == 404) {
      throw ApiException('Cuộc gọi đã kết thúc', response.statusCode);
    }
    if (response.statusCode == 409) {
      throw ApiException('Bạn đang có cuộc gọi khác đang hoạt động',
          response.statusCode);
    }
    throw ApiException('Xử lý cuộc gọi v2 thất bại', response.statusCode);
  }
  
  /// POST /api/calls/v2/connected
  /// Mark WebRTC as connected (start duration timer)
  Future<Map<String, dynamic>> markCallConnected(String callId) async {
    final response = await client.post(
      Uri.parse('$baseUrl/calls/v2/connected'),
      headers: headers,
      body: json.encode({'callId': callId}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Đánh dấu connected thất bại', response.statusCode);
  }
  
  /// GET /api/calls/v2/ice-servers
  /// Get STUN/TURN server config (Google, Xirsys, Twilio)
  Future<Map<String, dynamic>> getIceServers() async {
    final response = await client.get(
      Uri.parse('$baseUrl/calls/v2/ice-servers'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200) {
      return json.decode(response.body) as Map<String, dynamic>;
    }
    throw ApiException('Không thể tải ICE servers', response.statusCode);
  }
}
