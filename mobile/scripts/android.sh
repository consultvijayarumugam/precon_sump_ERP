#!/usr/bin/env bash
# Android builds, using the JDK and SDK that come with Android Studio.
#   bash scripts/android.sh run   - debug build on the running emulator / connected phone
#   bash scripts/android.sh apk   - installable release APK at build/precon-sump.apk
set -euo pipefail
cd "$(dirname "$0")/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
# Phones are ARM. Add x86_64 only if you use an Intel emulator.
ARCHS="${ARCHS:-arm64-v8a,armeabi-v7a}"

case "${1:-}" in
  run)
    shift; npx expo run:android "$@"
    ;;
  apk)
    npx expo prebuild --platform android --no-install
    (cd android && ./gradlew assembleRelease -PreactNativeArchitectures="$ARCHS" --console=plain)
    mkdir -p build
    cp android/app/build/outputs/apk/release/app-release.apk build/precon-sump.apk
    echo "APK ready: $(pwd)/build/precon-sump.apk"
    ;;
  *)
    echo "Usage: bash scripts/android.sh run|apk" >&2
    exit 1
    ;;
esac
