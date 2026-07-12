#!/usr/bin/env bash
# Prepares a stock create-expo-app@latest scaffold for the release-gate's
# native-compile smoke test: patches the two identifiers expo prebuild
# requires to run non-interactively, installs the packed library tarball,
# imports it so Metro actually has to resolve the packed main/exports (not
# just `npm install` succeeding), and (optionally) installs a deliberately
# incompatible peer dependency so the gate can prove it fails when the
# library is genuinely incompatible.
#
# Usage: prepare-smoke-app.sh <app_dir> <tarball_path> <break_peer_dep: true|false> <platform: ios|android>
set -euo pipefail

APP_DIR="$1"
TARBALL="$2"
BREAK_PEER_DEP="${3:-false}"
PLATFORM="$4"

cd "$APP_DIR"

echo "== Patching app.json with the bundle identifier / package expo prebuild requires =="
jq '.expo.ios.bundleIdentifier = "com.iotashanllc.rnsurveylibrarysmoke" | .expo.android.package = "com.iotashanllc.rnsurveylibrarysmoke"' app.json > app.json.tmp
mv app.json.tmp app.json

RESOLVED_EXPO_VERSION=$(node -p "require('./package.json').dependencies.expo")
RESOLVED_EXPO_MAJOR=$(echo "$RESOLVED_EXPO_VERSION" | sed -E 's/^[^0-9]*([0-9]+).*/\1/')
echo "create-expo-app@latest resolved expo@${RESOLVED_EXPO_VERSION} (major ${RESOLVED_EXPO_MAJOR})"
if [[ "$RESOLVED_EXPO_MAJOR" != "57" ]]; then
  echo "::error::Expected create-expo-app@latest to resolve Expo SDK 57 (this library's target), got expo@${RESOLVED_EXPO_VERSION}. The scaffolder has moved on — decide whether to bump the library's target or pin the scaffold template before trusting this gate."
  exit 1
fi

echo "== Installing the packed library tarball: ${TARBALL} =="
npm install "$TARBALL"

if [[ "$BREAK_PEER_DEP" == "true" ]]; then
  echo "::warning::break_peer_dep=true — deliberately installing an incompatible react-native@0.73.0 peer to prove this gate can fail. Do not enable this for a real release run."
  npm install react-native@0.73.0 --save-exact
fi

echo "== Running expo-doctor (informational — the JS bundle + native compile steps below are the real gate) =="
npx expo-doctor || echo "::warning::expo-doctor reported issues (see above). Continuing to the JS bundle + native compile."

echo "== Importing the packed library from App.tsx so Metro must resolve its main/exports =="
node -e "
const fs = require('fs');
const contents = fs.readFileSync('App.tsx', 'utf8');
fs.writeFileSync('App.tsx', \"import '@iotashan-llc/react-native-survey-library';\n\" + contents);
"

echo "== Bundling the JS for ${PLATFORM} (fails fast on a broken packed main/exports, before the slow native compile) =="
npx expo export --platform "$PLATFORM" --output-dir "$RUNNER_TEMP/expo-export-${PLATFORM}"
