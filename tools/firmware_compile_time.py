"""Verify current UTC sketch compile marker, not precompiled ESP-IDF core date."""
from datetime import datetime, timedelta, timezone
import struct
import re


MARKER = b"ZJ_BUILD_UTC="
STAMP = re.compile(rb"^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s+\d\d:\d\d:\d\d)\x00")


def sketch_compiled_at(image: bytes, offset: int = 0):
    position = image.find(MARKER, offset)
    if position < 0:
        return None
    match = STAMP.match(image[position + len(MARKER):position + len(MARKER) + 40])
    if not match:
        raise ValueError("Malformed ZEBJUS sketch compile date marker")
    return datetime.strptime(match.group(1).decode('ascii'), "%b %d %Y %H:%M:%S").replace(tzinfo=timezone.utc)


def compiled_at(image: bytes, offset: int = 0, require_marker: bool = False) -> datetime:
    # Prefer the sketch's __DATE__/__TIME__. Arduino-ESP32 supplies a prebuilt
    # ESP-IDF app descriptor with its own *older* package compilation time.
    sketch = sketch_compiled_at(image, offset)
    if sketch is not None:
        return sketch
    if require_marker:
        raise ValueError("Firmware has no live ZJ_BUILD_UTC sketch compile marker")
    if len(image) < offset + 144 or struct.unpack_from("<I", image, offset + 32)[0] != 0xABCD5432:
        raise ValueError("ESP32 firmware app descriptor is missing")
    def read_ascii(position):
        raw = image[offset + position: offset + position + 16].split(b"\x00", 1)[0]
        return raw.decode("ascii", errors="strict").strip()
    date, clock = read_ascii(128), read_ascii(112)
    try:
        value = datetime.strptime(f"{date} {clock}", "%b %d %Y %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ValueError("ESP32 firmware contains an invalid embedded compile date/time") from exc
    return value


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def check_compiled_at(image: bytes, build_started_at: str, now: datetime | None = None, offset: int = 0, require_marker: bool = False) -> str:
    compiled = compiled_at(image, offset, require_marker=require_marker)
    begun = datetime.fromisoformat(build_started_at.replace("Z", "+00:00"))
    completed = now or datetime.now(timezone.utc)
    # Start may be recorded before ESP32 toolchain downloads. Reject old cached
    # build artifacts and future-dated compilers; CI should rebuild, not relabel.
    if compiled < begun - timedelta(minutes=15) or compiled > completed + timedelta(minutes=5):
        raise ValueError(
            f"Stale or future ESP32 APP compile timestamp {iso_utc(compiled)} "
            f"does not match this release build beginning {iso_utc(begun)}")
    return iso_utc(compiled)
