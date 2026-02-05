import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

import '../../domain/entities/app_user.dart';

part 'user_model.freezed.dart';

/// Firestore-compatible user model with JSON serialization.
@freezed
class UserModel with _$UserModel {
  const factory UserModel({
    required String id,
    required String email,
    String? displayName,
    String? photoUrl,
    @Default(0) int reputationScore,
    @Default(0) int totalReports,
    @Default(0.0) double milesDriven,
    required DateTime createdAt,
    required DateTime lastActive,
  }) = _UserModel;

  const UserModel._();

  factory UserModel.fromEntity(AppUser user) {
    return UserModel(
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      photoUrl: user.photoUrl,
      reputationScore: user.reputationScore,
      totalReports: user.totalReports,
      milesDriven: user.milesDriven,
      createdAt: user.createdAt,
      lastActive: user.lastActive,
    );
  }

  AppUser toEntity() {
    return AppUser(
      id: id,
      email: email,
      displayName: displayName,
      photoUrl: photoUrl,
      reputationScore: reputationScore,
      totalReports: totalReports,
      milesDriven: milesDriven,
      createdAt: createdAt,
      lastActive: lastActive,
    );
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String?,
      photoUrl: json['photoUrl'] as String?,
      reputationScore: (json['reputationScore'] as int?) ?? 0,
      totalReports: (json['totalReports'] as int?) ?? 0,
      milesDriven: ((json['milesDriven'] as num?) ?? 0).toDouble(),
      createdAt: _dateFromJson(json['createdAt']),
      lastActive: _dateFromJson(json['lastActive']),
    );
  }

  static DateTime _dateFromJson(dynamic value) {
    if (value == null) return DateTime.now();
    if (value is Timestamp) return value.toDate();
    if (value is String) return DateTime.parse(value);
    return DateTime.now();
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'displayName': displayName,
      'photoUrl': photoUrl,
      'reputationScore': reputationScore,
      'totalReports': totalReports,
      'milesDriven': milesDriven,
      'createdAt': Timestamp.fromDate(createdAt),
      'lastActive': Timestamp.fromDate(lastActive),
    };
  }
}
