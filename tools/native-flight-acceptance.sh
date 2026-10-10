#!/usr/bin/env bash
set -euo pipefail
mkdir -p test-output/native
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
run_case baseline-preference -e baselineOnly true
adb install -r mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk | tee test-output/native/in-place-upgrade.log
adb shell dumpsys package in.zebjus.dronelab.companion | grep -E 'versionCode|versionName|signatures' > test-output/native/installed-identity.txt
grep -q 'versionCode=13' test-output/native/installed-identity.txt
adb shell svc wifi disable
adb shell svc data disable
# Native display metrics in portrait coordinates; activity remains landscape.
for spec in '720 1280 16x9' '720 1560 19_5x9'; do
  read -r display_w display_h label <<< "$spec"
  # Resize while the app is stopped. Each completed case already captures its
  # real foreground; restarting only to take another screenshot is redundant.
  adb shell am force-stop in.zebjus.dronelab.companion
  adb shell wm size "${display_w}x${display_h}"
  run_case "touch-${label}" -e expectedPreset Fast
  run_case "touch-reverse-${label}" -e expectedPreset Fast -e reverse true
done
adb shell wm size reset
adb logcat -d -t 1200 > test-output/native/logcat.txt
