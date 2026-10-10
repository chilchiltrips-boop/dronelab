"""Set a disposable CI AVD's physical LCD before its emulator starts."""
import os
import re
import sys
from pathlib import Path

specs = {"16x9": ("zebjus-flight-16x9", 720, 1280),
         "19_5x9": ("zebjus-flight-19x9", 720, 1560)}
name, width, height = specs[sys.argv[1]]
config = Path(os.environ["ANDROID_AVD_HOME"]) / (name + ".avd") / "config.ini"
text = config.read_text()
for key, value in {"hw.lcd.width": width, "hw.lcd.height": height,
                   "hw.lcd.density": 420}.items():
    text = re.sub(r"^" + re.escape(key) + r"\s*=.*(?:\n|$)", "", text, flags=re.M)
    text = text.rstrip() + f"\n{key}={value}\n"
config.write_text(text)
print(f"CI AVD {name}: physical LCD {width}x{height}, density 420 before boot")
