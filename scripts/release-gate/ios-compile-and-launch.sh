#!/usr/bin/env bash
# Compiles the smoke app for the iOS Simulator (no code signing) and then
# proves the resulting binary boots without crashing: launch it and poll
# that the process stays alive for ~10s. This is the "launch smoke" half of
# the release gate — the simplest reliable crash check for a Debug/simulator
# build that never embeds a JS bundle (Metro isn't running in CI, so a
# missing dev-server connection is expected and is not treated as a crash;
# this step only catches native-side failures: bad Info.plist, broken
# CocoaPods/autolinking integration, dyld load failures, immediate abort).
#
# Usage: ios-compile-and-launch.sh <app_dir>
set -euo pipefail

APP_DIR="$1"

cd "$APP_DIR/ios"

WORKSPACE=$(find . -maxdepth 1 -name '*.xcworkspace' | head -n1)
if [[ -z "$WORKSPACE" ]]; then
  echo "::error::No .xcworkspace found under ${APP_DIR}/ios — did expo prebuild run?"
  exit 1
fi

# Don't parse `xcodebuild -list`'s Schemes: section — CocoaPods shares a
# scheme per pod target (EXConstants, ExpoModulesCore, ...) alongside the
# app's own scheme, and `-list` sorts alphabetically, so the first line is
# very likely a Pods sub-scheme rather than the app. The generated app
# .xcodeproj's basename (as opposed to Pods.xcodeproj) is the app's actual
# scheme name and is unambiguous.
APP_PROJECT=$(find . -maxdepth 1 -name '*.xcodeproj' ! -name 'Pods.xcodeproj' | head -n1)
if [[ -z "$APP_PROJECT" ]]; then
  echo "::error::No app .xcodeproj found under ${APP_DIR}/ios — did expo prebuild run?"
  exit 1
fi
SCHEME=$(basename "$APP_PROJECT" .xcodeproj)

echo "== Building ${WORKSPACE} (scheme: ${SCHEME}) for iphonesimulator, no signing =="
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build \
  ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build

BUILD_PRODUCTS="build/Build/Products/Debug-iphonesimulator"
APP_PATH=$(find "$BUILD_PRODUCTS" -maxdepth 1 -name '*.app' | head -n1)
if [[ -z "$APP_PATH" ]]; then
  echo "::error::No .app bundle found under ${BUILD_PRODUCTS}"
  exit 1
fi

BUNDLE_ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist")
echo "Built ${APP_PATH} (bundle id: ${BUNDLE_ID})"

UDID=$(xcrun simctl list devices available -j | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const runtime of Object.keys(data.devices)) {
    for (const d of data.devices[runtime]) {
      if (d.isAvailable && /^iPhone/.test(d.name)) {
        console.log(d.udid);
        process.exit(0);
      }
    }
  }
  process.exit(1);
')
if [[ -z "$UDID" ]]; then
  echo "::error::No available iPhone simulator found on this runner image"
  exit 1
fi

echo "== Booting simulator ${UDID} =="
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b

echo "== Installing and launching ${BUNDLE_ID} =="
xcrun simctl install "$UDID" "$APP_PATH"
LAUNCH_OUTPUT=$(xcrun simctl launch "$UDID" "$BUNDLE_ID")
echo "$LAUNCH_OUTPUT"

PID=$(echo "$LAUNCH_OUTPUT" | awk -F': ' '{print $2}')
if [[ -z "$PID" ]]; then
  echo "::error::Could not determine the launched process PID from: ${LAUNCH_OUTPUT}"
  exit 1
fi

echo "== Polling pid ${PID} for ~10s to confirm the app didn't crash on boot =="
for i in $(seq 1 10); do
  sleep 1
  if ! ps -p "$PID" > /dev/null 2>&1; then
    echo "::error::App process (pid ${PID}) exited after ${i}s — treating this as a crash on boot"
    exit 1
  fi
done

echo "App process (pid ${PID}) stayed alive for 10s — launch smoke passed"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" || true
