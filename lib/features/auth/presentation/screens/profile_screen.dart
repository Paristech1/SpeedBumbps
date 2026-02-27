import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/entities/app_user.dart';
import '../providers/auth_state_provider.dart';
import '../state/auth_state.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return authState.when(
      authenticated: (user) => _buildProfileView(context, ref, user),
      unauthenticated: () => const Scaffold(
        backgroundColor: AppColors.darkBg,
        body: Center(
          child: Text('Please log in', style: TextStyle(color: AppColors.textSecondary)),
        ),
      ),
      loading: () => Scaffold(
        backgroundColor: AppColors.darkBg,
        body: Center(
          child: CircularProgressIndicator(color: AppColors.neonGreen),
        ),
      ),
      error: (message) => Scaffold(
        backgroundColor: AppColors.darkBg,
        body: Center(
          child: Text('Error: $message', style: TextStyle(color: AppColors.hazardRed)),
        ),
      ),
    );
  }

  Widget _buildProfileView(BuildContext context, WidgetRef ref, AppUser user) {
    return Scaffold(
      backgroundColor: AppColors.darkBg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Profile'),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              color: AppColors.darkSurface.withOpacity(0.6),
              borderRadius: BorderRadius.circular(12),
            ),
            child: IconButton(
              icon: const Icon(Icons.logout, color: AppColors.textPrimary),
              onPressed: () => _handleLogout(context, ref),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            // Avatar with glow
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.cyan.withOpacity(0.25),
                    blurRadius: 20,
                    spreadRadius: 4,
                  ),
                ],
              ),
              child: CircleAvatar(
                radius: 60,
                backgroundColor: AppColors.darkSurfaceLight,
                backgroundImage:
                    user.photoUrl != null ? NetworkImage(user.photoUrl!) : null,
                child: user.photoUrl == null
                    ? const Icon(Icons.person, size: 60, color: AppColors.textSecondary)
                    : null,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              user.displayName ?? 'Anonymous Driver',
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              user.email,
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 12),
            // Rank badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.neonGreen.withOpacity(0.12),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.neonGreen.withOpacity(0.3),
                ),
              ),
              child: Text(
                user.rank,
                style: const TextStyle(
                  color: AppColors.neonGreen,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 32),
            // Stats row
            Row(
              children: [
                Expanded(
                  child: _buildStatCard(
                    icon: Icons.stars,
                    label: 'Reputation',
                    value: user.reputationScore.toString(),
                    color: AppColors.warningAmber,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildStatCard(
                    icon: Icons.flag,
                    label: 'Reports',
                    value: user.totalReports.toString(),
                    color: AppColors.cyan,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildStatCard(
              icon: Icons.directions_car,
              label: 'Miles Driven',
              value: user.milesDriven.toStringAsFixed(1),
              color: AppColors.neonGreen,
            ),
            const SizedBox(height: 32),
            // Menu items
            _buildMenuItem(
              context,
              icon: Icons.photo_library,
              title: 'My Submissions',
              subtitle: 'View report history and status',
              onTap: () => Navigator.of(context).pushNamed('/submission-history'),
            ),
            _buildMenuItem(
              context,
              icon: Icons.edit,
              title: 'Edit Profile',
              onTap: () {},
            ),
            _buildMenuItem(
              context,
              icon: Icons.security,
              title: 'Change Password',
              onTap: () {},
            ),
            _buildMenuItem(
              context,
              icon: Icons.delete_forever,
              title: 'Delete Account',
              isDestructive: true,
              onTap: () => _handleDeleteAccount(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatCard({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: GlassmorphismDecoration.card(
        borderColor: color.withOpacity(0.2),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: color, size: 28),
          ),
          const SizedBox(height: 12),
          Text(
            value,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    String? subtitle,
    bool isDestructive = false,
    required VoidCallback onTap,
  }) {
    final color = isDestructive ? AppColors.hazardRed : AppColors.neonGreen;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AppColors.darkSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: ListTile(
        leading: Icon(icon, color: color),
        title: Text(
          title,
          style: TextStyle(
            color: isDestructive ? AppColors.hazardRed : AppColors.textPrimary,
          ),
        ),
        subtitle: subtitle != null
            ? Text(subtitle, style: TextStyle(color: AppColors.textSecondary, fontSize: 12))
            : null,
        trailing: Icon(Icons.chevron_right, color: AppColors.textSecondary),
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _handleLogout(BuildContext context, WidgetRef ref) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.darkSurface,
        title: const Text('Logout', style: TextStyle(color: AppColors.textPrimary)),
        content: const Text(
          'Are you sure you want to logout?',
          style: TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: AppColors.textSecondary)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Logout', style: TextStyle(color: AppColors.hazardRed)),
          ),
        ],
      ),
    );

    if (confirm == true && context.mounted) {
      await ref.read(authStateProvider.notifier).signOut();
      if (context.mounted) {
        Navigator.of(context).pushNamedAndRemoveUntil('/auth', (route) => false);
      }
    }
  }

  Future<void> _handleDeleteAccount(BuildContext context, WidgetRef ref) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.darkSurface,
        title: const Text('Delete Account', style: TextStyle(color: AppColors.hazardRed)),
        content: const Text(
          'This will permanently delete your account and all data. '
          'This action cannot be undone.',
          style: TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel', style: TextStyle(color: AppColors.textSecondary)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.hazardRed),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true && context.mounted) {
      try {
        await ref.read(authStateProvider.notifier).deleteAccount();
        if (context.mounted) {
          Navigator.of(context).pushNamedAndRemoveUntil('/auth', (route) => false);
        }
      } catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(e.toString()),
              backgroundColor: AppColors.hazardRed,
            ),
          );
        }
      }
    }
  }
}
