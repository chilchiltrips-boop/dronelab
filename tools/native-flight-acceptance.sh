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
run_case() {
  local case_name="$1"
  shift
  adb shell am instrument -w -r "$@" "$runner" | tee "test-output/native/$case_name.log"
  if ! grep -q 'PASS ' "test-output/native/$case_name.log" || grep -Eq 'FAIL |INSTRUMENTATION_FAILED|INSTRUMENTATION_CODE: 0' "test-output/native/$case_name.log"; then
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
grep -q 'versionCode=13' "test-output/native/installed-identity-${label}.txt"
adb shell svc wifi disable
adb shell svc data disable
# One display size per fresh AVD. Emulator 37.2.12 lost its connection when
# changing 16x9 to 19.5x9 within the same running virtual device. CI boots two
# independent AVDs and requires BOTH forward/reverse runs in each, with a new
# APK12->13 preference-preserving upgrade in each device.
adb shell am force-stop in.zebjus.dronelab.companion
adb shell wm size "${display_w}x${display_h}"
run_case "touch-${label}" -e expectedPreset Fast
run_case "touch-reverse-${label}" -e expectedPreset Fast -e reverse true
adb logcat -d -t 1200 > "test-output/native/logcat-${label}.txt"
