import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'user_model.dart';

@immutable
class NotificationModel {
  final String id;
  final String recipientId;
  final String? actorId;
  final UserModel? actor; // populated when joined
  final String type; // friend_request | friend_accept | like | comment | share | follow | mention | group_invite | system
  final String title;
  final String body;
  final Map<String, dynamic>? data;
  final bool read;
  final DateTime? readAt;
  final DateTime createdAt;

  const NotificationModel({
    required this.id,
    required this.recipientId,
    this.actorId,
    this.actor,
    required this.type,
    required this.title,
    required this.body,
    this.data,
    this.read = false,
    this.readAt,
    required this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? parsedData;
    final raw = json['data'];
    if (raw is Map<String, dynamic>) {
      parsedData = raw;
    } else if (raw is String && raw.isNotEmpty) {
      try {
        parsedData = jsonDecode(raw) as Map<String, dynamic>;
      } catch (_) {
        parsedData = null;
      }
    }
    return NotificationModel(
      id: json['id'] as String,
      recipientId: (json['recipient_id'] ?? json['recipientId']) as String,
      actorId: (json['actor_id'] ?? json['actorId']) as String?,
      actor: json['actor'] is Map<String, dynamic>
          ? UserModel.fromJson(json['actor'] as Map<String, dynamic>)
          : null,
      type: json['type'] as String,
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      data: parsedData,
      read: json['read'] == 1 || json['read'] == true,
      readAt: _parse(json['read_at'] ?? json['readAt']),
      createdAt: _parse(json['created_at'] ?? json['createdAt']) ??
          DateTime.now(),
    );
  }

  NotificationModel copyWith({bool? read, DateTime? readAt}) =>
      NotificationModel(
        id: id,
        recipientId: recipientId,
        actorId: actorId,
        actor: actor,
        type: type,
        title: title,
        body: body,
        data: data,
        read: read ?? this.read,
        readAt: readAt ?? this.readAt,
        createdAt: createdAt,
      );
}

DateTime? _parse(dynamic v) {
  if (v == null) return null;
  if (v is DateTime) return v;
  if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt() * 1000);
  if (v is String) return DateTime.tryParse(v);
  return null;
}
