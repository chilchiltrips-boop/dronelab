#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-output/native
label="${1:-16x9}"
case "$label" in
  16x9) display_w=720; display_h=1280 ;;
  19_5x9) display_w=720; display_h=1560 ;;
  *) echo "Unsupported native display case: $label"; exit 2 ;;
esac
runner='in.zebjus.dronelab.companion.test/in.zebjus.dronelab.companion.FlightTouchInstrumentation'
test_apk='mobile-android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk'
# The API 35 emulator's first immersive launch can display Android's own
# "Viewing full screen" onboarding over the WebView and steal window focus.
# Pre-confirm ONLY this disposable CI emulator's OS tutorial (not any app dialog).
# Keep every production WebView, focus, signed-upgrade and multitouch assertion.
adb wait-for-device
boot_ready=0
for ((attempt=0; attempt<60; attempt++)); do
  if [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == "1" ]]; then
    boot_ready=1
    break
  fi
  sleep 2
done
if [[ "$boot_ready" != 1 ]]; then
  echo "::error::Android emulator did not complete boot"
  exit 1
fi
adb shell settings put secure immersive_mode_confirmations confirmed
immersive_confirmed="$(adb shell settings get secure immersive_mode_confirmations | tr -d '\r')"
if [[ "$immersive_confirmed" != confirmed ]]; then
  echo "::error::CI emulator fullscreen onboarding remains unconfirmed: $immersive_confirmed"
  exit 1
fi
echo "Android emulator fully booted; first-run immersive tutorial pre-confirmed."
run_case() {
  local case_name="$1"
  shift
  adb shell am instrument -w -r "$@" "$runner" | tee "test-output/native/$case_name.log"
  if ! grep -q 'PASS ' "test-output/native/$case_name.log" || grep -Eq 'FAIL |INSTRUMENTATION_FAILED|INSTRUMENTATION_CODE: 0' "test-output/native/$case_name.log"; then
    adb logcat -d -t 1800 > "test-output/native/failure-logcat-${case_name}.txt" || true
    # The instrumentation captures the foreground BEFORE finish() closes it.
    adb pull /sdcard/Android/data/in.zebjus.dronelab.companion/files/native-ready.png "test-output/native/ready-${case_name}.png" || true
    if ! adb pull /sdcard/Android/data/in.zebjus.dronelab.companion/files/native-failure.png "test-output/native/failure-${case_name}.png"; then
      adb exec-out screencap -p > "test-output/native/failure-${case_name}.png"
    fi
    echo "Native acceptance failed: $case_name"
    exit 1
  fi
  if [[ "$case_name" == touch-* ]]; then
    adb pull /sdcard/Android/data/in.zebjus.dronelab.companion/files/native-completed.png "test-output/native/landscape-${case_name}.png"
  fi
  adb shell am force-stop in.zebjus.dronelab.companion
}
adb install "$RUNNER_TEMP/zebjus-previous.apk"
adb install "$test_apk"
run_case "baseline-preference-${label}" -e baselineOnly true
adb install -r mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk | tee "test-output/native/in-place-upgrade-${label}.log"
adb shell dumpsys package in.zebjus.dronelab.companion | grep -E 'versionCode|versionName|signatures' > "test-output/native/installed-identity-${label}.txt"
grep -q 'versionCode=14' "test-output/native/installed-identity-${label}.txt"
adb shell svc wifi disable
adb shell svc data disable
# One display size per fresh AVD. Emulator 37.2.12 lost its connection when
# changing 16x9 to 19.5x9 within the same running virtual device. CI boots two
# independent AVDs; mandatory 16:9 checks both landscape directions with
# APK13->14 preference-preserving upgrade. Wider native phones need manual QA.
adb shell am force-stop in.zebjus.dronelab.companion
adb shell wm size | tee "test-output/native/display-metrics-${label}.txt"
grep -q "Physical size: ${display_w}x${display_h}" "test-output/native/display-metrics-${label}.txt"
run_case "touch-${label}" -e expectedPreset Fast
run_case "touch-reverse-${label}" -e expectedPreset Fast -e reverse true
adb logcat -d -t 1200 > "test-output/native/logcat-${label}.txt"
