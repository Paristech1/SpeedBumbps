import 'package:freezed_annotation/freezed_annotation.dart';

part 'submission_state.freezed.dart';

@freezed
class SubmissionState with _$SubmissionState {
  const factory SubmissionState.initial() = _Initial;
  const factory SubmissionState.loading() = _Loading;
  const factory SubmissionState.success() = _Success;
  const factory SubmissionState.error(String message) = _Error;
}
