#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "❌ $1"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required tool: $1"
}

echo "== Toolchain checks =="
require_cmd flutter
require_cmd dart
require_cmd pod

if [[ "$(uname -s)" == "Darwin" ]]; then
  require_cmd xcodebuild
fi

echo "== Versions =="
flutter --version

dart --version
pod --version
if command -v xcodebuild >/dev/null 2>&1; then
  xcodebuild -version
fi

echo "== Flutter doctor =="
if ! flutter doctor -v; then
  fail "flutter doctor reported issues."
fi

echo "== Dependency install =="
flutter pub get

echo "== Generated file staleness check =="
if ! dart run build_runner build --delete-conflicting-outputs; then
  fail "build_runner failed. Resolve codegen issues before building."
fi

echo "✅ prebuild checks passed"
