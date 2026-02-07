#!/usr/bin/env bash
set -euo pipefail

if ! command -v flutter >/dev/null 2>&1; then
  echo "❌ Flutter is not installed or not on PATH."
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "⚠️ Non-macOS host detected. Falling back to macOS desktop build target."
  exec flutter run -d macos "$@"
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "⚠️ Xcode command line tools were not found. Falling back to macOS desktop build target."
  exec flutter run -d macos "$@"
fi

BOOTED_DEVICE_ID="$(xcrun simctl list devices available | awk '/Booted/{print $NF}' | tr -d '()' | head -n1)"

if [[ -n "$BOOTED_DEVICE_ID" ]]; then
  echo "✅ Using booted simulator: $BOOTED_DEVICE_ID"
  exec flutter run -d "$BOOTED_DEVICE_ID" "$@"
fi

LATEST_IPHONE_ID="$(xcrun simctl list devices available | sed -nE 's/^[[:space:]]*(iPhone[^\(]+) \(([-A-F0-9]+)\) \(Shutdown\)$/\1|\2/p' | sort -V | tail -n1 | cut -d'|' -f2)"

if [[ -n "$LATEST_IPHONE_ID" ]]; then
  echo "✅ Booting latest available iPhone simulator: $LATEST_IPHONE_ID"
  xcrun simctl boot "$LATEST_IPHONE_ID" >/dev/null 2>&1 || true
  open -a Simulator >/dev/null 2>&1 || true
  exec flutter run -d "$LATEST_IPHONE_ID" "$@"
fi

IOS_DEVICE_ID="$(flutter devices --machine 2>/dev/null | python3 - <<'PY'
import json, sys
raw=sys.stdin.read().strip()
if not raw:
    print("")
    raise SystemExit
for d in json.loads(raw):
    if d.get("targetPlatform") == "ios":
        print(d.get("id", ""))
        break
PY
)"

if [[ -n "$IOS_DEVICE_ID" ]]; then
  echo "✅ Using attached iOS device: $IOS_DEVICE_ID"
  exec flutter run -d "$IOS_DEVICE_ID" "$@"
fi

echo "⚠️ No available iOS simulators or physical iOS devices were detected. Falling back to macOS."
exec flutter run -d macos "$@"
