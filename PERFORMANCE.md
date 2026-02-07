# Performance Baseline

## Profiling setup
- Target: iOS simulator and physical iPhone (recommended for final validation).
- Tools: Flutter DevTools (CPU, memory, performance timeline), `flutter run --profile`.

## Current status in this environment
This workspace does not include Flutter/Xcode binaries, so runtime profiling could not be executed here. Use the commands below on a macOS dev machine with Xcode + Flutter installed.

## Commands
```bash
# Profile mode on iOS simulator/device
flutter run --profile -d <device_id>

# Open DevTools while app is running
flutter pub global run devtools
```

## Benchmarks to capture
Record baselines before and after dependency/toolchain updates.

| Metric | Scenario | Baseline (fill on device) |
|---|---|---|
| App startup time | cold start to map visible | TBD |
| Map load time | load map + 1,584 markers | TBD |
| Route calculation | set destination until route shown | TBD |
| Photo upload time | submit photo over Wi-Fi/LTE | TBD |
| Frame stability | dropped frame count during map pan/zoom | TBD |
| Memory trend | 5-minute map + camera + back navigation loop | TBD |

## Leak/jank checklist
- Watch memory heap after entering/leaving map and camera screens repeatedly.
- Track shader jank when opening map and displaying many markers.
- Verify there is no sustained memory growth after repeated submission flow.
