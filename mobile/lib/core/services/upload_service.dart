import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';

import '../config/app_config.dart';
import 'api_service.dart';

/// Type of upload. Maps to the backend `UploadType` discriminator.
enum UploadType { avatar, image, video, cover }

extension UploadTypeX on UploadType {
  String get wire => switch (this) {
        UploadType.avatar => 'avatar',
        UploadType.image => 'image',
        UploadType.video => 'video',
        UploadType.cover => 'cover',
      };
}

/// Result of a successful Cloudinary upload.
class CloudinaryUploadResult {
  final String publicId;
  final String url;
  final int? bytes;
  final int? width;
  final int? height;
  final String format;
  const CloudinaryUploadResult({
    required this.publicId,
    required this.url,
    this.bytes,
    this.width,
    this.height,
    this.format = '',
  });
}

/// Performs unsigned Cloudinary uploads and notifies the backend.
///
/// Backend exposes `POST /api/upload/confirm` so the server can track
/// `publicId`s for later deletion. The actual byte transfer is direct
/// to Cloudinary using the configured upload preset.
class UploadService {
  static const String _cloudName = 'sei3lgiv';
  static const String _uploadPreset = 'diary_upload';
  static const String _uploadUrl =
      'https://api.cloudinary.com/v1_1/$_cloudName/auto/upload';

  final ApiService _api;
  final Dio _dio;

  UploadService({ApiService? api})
      : _api = api ?? ApiService(baseUrl: AppConfig.apiBaseUrl),
        _dio = Dio(BaseOptions(
          sendTimeout: const Duration(minutes: 2),
          receiveTimeout: const Duration(minutes: 2),
        ));

  /// Picks an image from gallery and uploads it. Returns the public url
  /// and `publicId` after backend confirmation.
  Future<CloudinaryUploadResult> pickAndUploadImage({
    UploadType type = UploadType.image,
    ImageSource source = ImageSource.gallery,
  }) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: source,
      maxWidth: 2048,
      imageQuality: 88,
    );
    if (picked == null) {
      throw Exception('No image selected');
    }
    if (kIsWeb) {
      final bytes = await picked.readAsBytes();
      return uploadBytes(
        bytes: bytes,
        filename: picked.name,
        contentType: MediaType('image', 'jpeg'),
        type: type,
      );
    } else {
      return uploadFile(
        filePath: picked.path,
        filename: picked.name,
        type: type,
      );
    }
  }

  /// Picks a video from gallery and uploads it.
  Future<CloudinaryUploadResult> pickAndUploadVideo({
    UploadType type = UploadType.video,
  }) async {
    final picker = ImagePicker();
    final picked = await picker.pickVideo(source: ImageSource.gallery);
    if (picked == null) throw Exception('No video selected');
    if (kIsWeb) {
      final bytes = await picked.readAsBytes();
      return uploadBytes(
        bytes: bytes,
        filename: picked.name,
        contentType: MediaType('video', 'mp4'),
        type: type,
      );
    } else {
      return uploadFile(
        filePath: picked.path,
        filename: picked.name,
        type: type,
      );
    }
  }

  /// Picks any file (image, video, document) using the system file
  /// picker and uploads it. Useful for chat attachments.
  Future<CloudinaryUploadResult> pickAndUploadFile() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: false,
      withData: kIsWeb, // important: we need bytes on web
    );
    if (result == null || result.files.isEmpty) {
      throw Exception('No file selected');
    }
    final file = result.files.first;
    final ct = _guessContentType(file.name);
    if (kIsWeb) {
      final bytes = file.bytes;
      if (bytes == null) throw Exception('Empty file');
      return uploadBytes(
        bytes: bytes,
        filename: file.name,
        contentType: ct,
        type: ct.type == 'video'
            ? UploadType.video
            : UploadType.image,
      );
    } else {
      final path = file.path;
      if (path == null) throw Exception('No file path');
      return uploadFile(
        filePath: path,
        filename: file.name,
        type: ct.type == 'video'
            ? UploadType.video
            : UploadType.image,
      );
    }
  }

  /// Uploads raw bytes (web). Notifies backend on success.
  Future<CloudinaryUploadResult> uploadBytes({
    required Uint8List bytes,
    required String filename,
    required MediaType contentType,
    required UploadType type,
  }) async {
    final form = FormData.fromMap({
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: contentType,
      ),
      'upload_preset': _uploadPreset,
    });

    final response = await _dio.post<Map<String, dynamic>>(
      _uploadUrl,
      data: form,
      options: Options(
        responseType: ResponseType.json,
        headers: {'Accept': 'application/json'},
      ),
    );

    return _finalize(response.data, type);
  }

  /// Uploads a file from a path (mobile). Notifies backend on success.
  Future<CloudinaryUploadResult> uploadFile({
    required String filePath,
    required String filename,
    required UploadType type,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        filePath,
        filename: filename,
      ),
      'upload_preset': _uploadPreset,
    });

    final response = await _dio.post<Map<String, dynamic>>(
      _uploadUrl,
      data: form,
      options: Options(
        responseType: ResponseType.json,
        headers: {'Accept': 'application/json'},
      ),
    );

    return _finalize(response.data, type);
  }

  /// Uploads a network image URL by re-fetching the bytes (rarely
  /// needed — usually avatars are set by URL after sign-in).
  Future<CloudinaryUploadResult> uploadFromUrl(
    String url, {
    UploadType type = UploadType.image,
  }) async {
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) {
      throw Exception('Could not fetch $url');
    }
    final ct = MediaType.parse(res.headers['content-type'] ?? 'image/jpeg');
    final filename = Uri.parse(url).pathSegments.last.isEmpty
        ? 'upload.${ct.subtype}'
        : Uri.parse(url).pathSegments.last;
    return uploadBytes(
      bytes: res.bodyBytes,
      filename: filename,
      contentType: ct,
      type: type,
    );
  }

  Future<CloudinaryUploadResult> _finalize(
    Map<String, dynamic>? data,
    UploadType type,
  ) async {
    if (data == null) {
      throw Exception('Empty Cloudinary response');
    }
    final publicId = data['public_id'] as String?;
    final url = data['secure_url'] as String? ?? data['url'] as String?;
    if (publicId == null || url == null) {
      throw Exception('Cloudinary response missing fields: $data');
    }

    // Tell backend so the server can track this asset.
    try {
      await _api.confirmUpload(publicId: publicId, url: url, type: type.wire);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Backend confirmUpload failed (non-fatal): $e');
      }
    }

    return CloudinaryUploadResult(
      publicId: publicId,
      url: url,
      bytes: (data['bytes'] as num?)?.toInt(),
      width: (data['width'] as num?)?.toInt(),
      height: (data['height'] as num?)?.toInt(),
      format: data['format'] as String? ?? '',
    );
  }

  MediaType _guessContentType(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')) {
      return MediaType('video', 'mp4');
    }
    if (lower.endsWith('.png')) return MediaType('image', 'png');
    if (lower.endsWith('.webp')) return MediaType('image', 'webp');
    if (lower.endsWith('.gif')) return MediaType('image', 'gif');
    return MediaType('image', 'jpeg');
  }

  /// Helper for tests / scripts: build a request body to inspect.
  // ignore: unused_element
  Map<String, String> debugHeaderMap() => {
        'X-Cloudinary-Cloud-Name': _cloudName,
        'X-Cloudinary-Upload-Preset': _uploadPreset,
        'X-Cloudinary-Upload-Url': _uploadUrl,
      };

  // Convenience: explicit JSON encode of payload to assist logging.
  // ignore: unused_element
  String dumpForDebug(CloudinaryUploadResult r) =>
      jsonEncode(r.toJson()..remove('bytes'));

  void dispose() {
    _dio.close(force: true);
  }
}

extension on CloudinaryUploadResult {
  Map<String, dynamic> toJson() => {
        'publicId': publicId,
        'url': url,
        'bytes': bytes,
        'width': width,
        'height': height,
        'format': format,
      };
}
