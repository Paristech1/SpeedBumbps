#!/usr/bin/env bash

set -euo pipefail

on_error() {
  local exit_code=$?
  local line_no=${1:-unknown}
  echo "Setup failed at line ${line_no} with exit code ${exit_code}." >&2
  exit "$exit_code"
}
trap 'on_error "$LINENO"' ERR

run_step() {
  local description=$1
  shift

  echo "== ${description} =="
  "$@"
}

if ! command -v flutter >/dev/null 2>&1; then
  echo "'flutter' command not found. Install Flutter and ensure it is on your PATH." >&2
  exit 1
fi

if ! command -v dart >/dev/null 2>&1; then
  echo "'dart' command not found. Install Dart/Flutter SDK and ensure it is on your PATH." >&2
  exit 1
fi

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

run_step "Cleaning previous build outputs" flutter clean
run_step "Installing dependencies" flutter pub get
run_step "Generating code with build_runner" dart run build_runner build --delete-conflicting-outputs
run_step "Running test suite" flutter test

echo "Setup complete."
