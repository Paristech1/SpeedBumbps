import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/providers/auth_state_provider.dart';
import '../../../auth/presentation/state/auth_state.dart';
import 'admin_dashboard_screen.dart';

class AdminGateScreen extends ConsumerWidget {
  const AdminGateScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authStateProvider);

    return authState.when(
      loading: () => _buildLoading(),
      unauthenticated: () => _buildUnauthorized(
        context,
        message: 'Please sign in to access the admin dashboard.',
        actionLabel: 'Go to Login',
        onAction: () => Navigator.of(context).pushNamed('/auth'),
      ),
      error: (message) => _buildError(message),
      authenticated: (_) {
        final adminCheck = ref.watch(adminClaimProvider);
        return adminCheck.when(
          loading: () => _buildLoading(),
          error: (err, _) => _buildError(err.toString()),
          data: (isAdmin) {
            if (isAdmin) {
              return const AdminDashboardScreen();
            }
            return _buildUnauthorized(
              context,
              message: 'You do not have admin access.',
              actionLabel: 'Go Home',
              onAction: () => Navigator.of(context)
                  .pushNamedAndRemoveUntil('/home', (route) => false),
            );
          },
        );
      },
    );
  }

  Widget _buildLoading() {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }

  Widget _buildError(String message) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.red),
          ),
        ),
      ),
    );
  }

  Widget _buildUnauthorized(
    BuildContext context, {
    required String message,
    required String actionLabel,
    required VoidCallback onAction,
  }) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 64, color: Colors.grey),
              const SizedBox(height: 16),
              Text(
                message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: onAction,
                child: Text(actionLabel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
