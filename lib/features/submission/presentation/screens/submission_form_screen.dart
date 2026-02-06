import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/utils/exif_extractor.dart';
import '../../../auth/presentation/providers/auth_state_provider.dart';
import '../../../auth/presentation/state/auth_state.dart';
import '../../../map/presentation/providers/location_provider.dart';
import '../providers/submission_provider.dart';
import '../state/submission_state.dart';
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
              const SnackBar(
                content: Text('Report submitted! It will be reviewed soon.'),
                backgroundColor: Colors.green,
              ),
            );
          }
        },
      );
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Submit Report'),
      ),
      body: submissionState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        success: () => const Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle, color: Colors.green, size: 64),
              SizedBox(height: 16),
              Text('Report submitted!'),
            ],
          ),
        ),
        error: (msg) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Error: $msg', style: const TextStyle(color: Colors.red)),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => ref.read(submissionProvider.notifier).reset(),
                child: const Text('Try again'),
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
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(
              widget.photoFile,
              height: 200,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Location',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          if (_isLoadingLocation)
            const LinearProgressIndicator()
          else if (_location != null) ...[
            LocationMiniMap(location: _location!),
            const SizedBox(height: 8),
            Text(
              '${_location!.latitude.toStringAsFixed(6)}, ${_location!.longitude.toStringAsFixed(6)}',
              style: TextStyle(color: Colors.grey[600], fontSize: 12),
            ),
          ] else
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber, color: Colors.red.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No location detected. Please enable GPS and try again.',
                      style: TextStyle(color: Colors.red.shade900),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 24),
          Text(
            'How severe is this speed bump?',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
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
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _notesController,
            maxLines: 4,
            maxLength: 200,
            decoration: InputDecoration(
              hintText: 'e.g., Located near the school entrance',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 32),
          SizedBox(
            height: 56,
            child: ElevatedButton(
              onPressed: _location == null ? null : _handleSubmit,
              style: ElevatedButton.styleFrom(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Submit Report', style: TextStyle(fontSize: 18)),
            ),
          ),
        ],
      ),
    );
  }

  void _handleSubmit() {
    if (_location == null) return;
    final authState = ref.read(authStateProvider);
    authState.when(
      loading: () => _promptSignIn(),
      unauthenticated: () => _promptSignIn(),
      error: (_) => _promptSignIn(),
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

  void _promptSignIn() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Please sign in to submit a report.'),
        backgroundColor: Colors.red,
      ),
    );
    Navigator.of(context).pushNamed('/auth');
  }
}
