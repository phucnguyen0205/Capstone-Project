import 'dart:convert';
import 'package:pulo/core/services/api_service.dart';
import 'package:pulo/core/constants/api_constants.dart';

/// Extension methods for Avatar & Upload utilities
extension UtilityApiExtension on ApiService {
  
  // ============ AVATAR ============
  
  /// GET /api/avatar?userId=
  /// Returns redirect URL to user's avatar
  Future<String> getAvatarUrl(String userId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/avatar?userId=$userId'),
      headers: headers,
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode == 200 || response.statusCode == 302) {
      // Backend may return JSON with url or redirect directly
      if (response.body.isNotEmpty) {
        try {
          final data = json.decode(response.body);
          if (data is Map && data['url'] != null) {
            return data['url'] as String;
          }
        } catch (_) {}
      }
      // Fallback: construct cloudinary URL
      return '$baseUrl/avatar?userId=$userId';
    }
    throw ApiException('Không thể tải avatar', response.statusCode);
  }
  
  // ============ UPLOAD DELETE ============
  
  /// DELETE /api/upload/confirm
  /// Delete uploaded file from Cloudinary
  Future<void> deleteUpload(String publicId) async {
    final response = await client.delete(
      Uri.parse('$baseUrl/upload/confirm'),
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: json.encode({'publicId': publicId}),
    ).timeout(ApiConstants.connectionTimeout);
    
    if (response.statusCode != 200 && response.statusCode != 204) {
      throw ApiException('Xoá file thất bại', response.statusCode);
    }
  }
}
