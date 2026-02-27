import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/exif_extractor.dart';
import '../../../auth/presentation/providers/auth_state_provider.dart';
import '../../../map/presentation/providers/location_provider.dart';
import '../providers/submission_provider.dart';
import '../widgets/location_mini_map.dart';
import '../widgets/severity_selector.dart';

class SubmissionFormScreen extends ConsumerStatefulWidget {
  const SubmissionFormScreen({
    super.key,
    required this.photoFile,
  });

  final File photoFile;

  @override
  ConsumerState<SubmissionFormScreen> createState() =>
      _SubmissionFormScreenState();
}

class _SubmissionFormScreenState extends ConsumerState<SubmissionFormScreen> {
  final _notesController = TextEditingController();
  LatLng? _location;
  int _severity = 3;
  bool _isLoadingLocation = true;
  bool _extractionStarted = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _extractLocation() async {
    if (!mounted) return;
    LatLng? exifLocation =
        await ExifExtractor.extractLocation(widget.photoFile);
    if (mounted && exifLocation != null) {
      setState(() {
        _location = exifLocation;
        _isLoadingLocation = false;
      });
      return;
    }
    try {
      final repo = ref.read(locationRepositoryProvider);
      final userLocation = await repo.getCurrentLocation();
      if (mounted) {
        setState(() {
          _location = LatLng(
            userLocation.latitude,
            userLocation.longitude,
          );
          _isLoadingLocation = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoadingLocation = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoadingLocation && !_extractionStarted) {
      _extractionStarted = true;
      Future.microtask(() => _extractLocation());
    }

    final submissionState = ref.watch(submissionProvider);
    ref.listen(submissionProvider, (prev, next) {
      next.whenOrNull(
        success: () {
          if (context.mounted) {
            Navigator.of(context).popUntil((route) => route.isFirst);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: const Text('Report submitted! It will be reviewed soon.'),
                backgroundColor: AppColors.neonGreen,
              ),
            );
          }
        },
      );
    });

    return Scaffold(
      backgroundColor: AppColors.darkBg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Submit Report'),
      ),
      body: submissionState.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.neonGreen),
        ),
        success: () => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.neonGreen.withOpacity(0.3),
                      blurRadius: 20,
                      spreadRadius: 5,
                    ),
                  ],
                ),
                child: const Icon(Icons.check_circle, color: AppColors.neonGreen, size: 64),
              ),
              const SizedBox(height: 16),
              const Text(
                'Report submitted!',
                style: TextStyle(color: AppColors.textPrimary, fontSize: 18),
              ),
            ],
          ),
        ),
        error: (msg) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                'Error: $msg',
                style: const TextStyle(color: AppColors.hazardRed),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => ref.read(submissionProvider.notifier).reset(),
                child: const Text('Try again', style: TextStyle(color: AppColors.cyan)),
              ),
            ],
          ),
        ),
        initial: () => _buildForm(),
      ),
    );
  }

  Widget _buildForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Photo preview with neon border
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.neonGreen.withOpacity(0.3), width: 2),
              boxShadow: [
                BoxShadow(
                  color: AppColors.neonGreen.withOpacity(0.1),
                  blurRadius: 12,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.file(
                widget.photoFile,
                height: 200,
                fit: BoxFit.cover,
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Location',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          if (_isLoadingLocation)
            LinearProgressIndicator(
              color: AppColors.neonGreen,
              backgroundColor: AppColors.darkSurfaceLight,
            )
          else if (_location != null) ...[
            LocationMiniMap(location: _location!),
            const SizedBox(height: 8),
            Text(
              '${_location!.latitude.toStringAsFixed(6)}, ${_location!.longitude.toStringAsFixed(6)}',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
            ),
          ] else
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.hazardRed.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.hazardRed.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber, color: AppColors.hazardRed),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No location detected. Please enable GPS and try again.',
                      style: TextStyle(color: AppColors.hazardRed),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          Text(
            'How severe is this speed bump?',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          SeveritySelector(
            initialValue: _severity,
            onChanged: (value) => setState(() => _severity = value),
          ),
          const SizedBox(height: 24),
          Text(
            'Additional Notes (Optional)',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _notesController,
            maxLines: 4,
            maxLength: 200,
            style: const TextStyle(color: AppColors.textPrimary),
            decoration: InputDecoration(
              hintText: 'e.g., Located near the school entrance',
            ),
          ),
          const SizedBox(height: 32),
          GradientButton(
            onPressed: _location == null ? null : _handleSubmit,
            child: const Text(
              'Submit Report',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleSubmit() {
    if (_location == null) return;
    final authState = ref.read(authStateProvider);
    authState.whenOrNull(
      authenticated: (user) {
        ref.read(submissionProvider.notifier).submitReport(
              userId: user.id,
              userEmail: user.email,
              photoFile: widget.photoFile,
              location: _location!,
              severity: _severity,
              notes: _notesController.text.isEmpty
                  ? null
                  : _notesController.text.trim(),
            );
      },
    );
  }
}
