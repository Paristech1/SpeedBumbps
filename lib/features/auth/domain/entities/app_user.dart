import 'package:freezed_annotation/freezed_annotation.dart';

part 'app_user.freezed.dart';

/// Core user entity (no Firebase dependencies in domain layer).
@freezed
abstract class AppUser with _$AppUser {
  const factory AppUser({
    required String id,
    required String email,
    String? displayName,
    String? photoUrl,
    @Default(0) int reputationScore,
    @Default(0) int totalReports,
    @Default(0.0) double milesDriven,
    required DateTime createdAt,
    required DateTime lastActive,
  }) = _AppUser;

  const AppUser._();

  /// User rank based on reputation.
  String get rank {
    if (reputationScore < 100) return 'Rookie';
    if (reputationScore < 500) return 'Navigator';
    if (reputationScore < 1000) return 'Road Warrior';
    return 'Legend';
  }

  /// Whether the user profile has a display name set.
  bool get isProfileComplete =>
      displayName != null && displayName!.isNotEmpty;
}
