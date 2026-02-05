import 'package:flutter_test/flutter_test.dart';
import 'package:speed_bump_app/features/auth/domain/entities/app_user.dart';

void main() {
  final now = DateTime.now();

  group('AppUser', () {
    test('rank returns Rookie when reputationScore < 100', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        reputationScore: 50,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.rank, 'Rookie');
    });

    test('rank returns Navigator when reputationScore >= 100 and < 500', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        reputationScore: 150,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.rank, 'Navigator');
    });

    test('rank returns Road Warrior when reputationScore >= 500 and < 1000', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        reputationScore: 600,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.rank, 'Road Warrior');
    });

    test('rank returns Legend when reputationScore >= 1000', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        reputationScore: 1200,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.rank, 'Legend');
    });

    test('isProfileComplete returns true when displayName is set', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        displayName: 'John Doe',
        reputationScore: 0,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.isProfileComplete, isTrue);
    });

    test('isProfileComplete returns false when displayName is null', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        reputationScore: 0,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.isProfileComplete, isFalse);
    });

    test('isProfileComplete returns false when displayName is empty', () {
      final user = AppUser(
        id: '123',
        email: 'test@example.com',
        displayName: '',
        reputationScore: 0,
        totalReports: 0,
        milesDriven: 0,
        createdAt: now,
        lastActive: now,
      );
      expect(user.isProfileComplete, isFalse);
    });
  });
}
