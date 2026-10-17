"""Validate the UTC sketch compile marker, not Arduino core packaging dates.

Official releases require ZJ_BUILD_UTC from current sketch compilation.
Legacy ESP-IDF app descriptor remains readable only as fallback diagnostics.
"""
from datetime import datetime, timedelta, timezone
import struct


def compiled_at(image: bytes, offset: int = 0) -> datetime:
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


def check_compiled_at(image: bytes, build_started_at: str, now: datetime | None = None, offset: int = 0) -> str:
    compiled = compiled_at(image, offset)
    begun = datetime.fromisoformat(build_started_at.replace("Z", "+00:00"))
    completed = now or datetime.now(timezone.utc)
    # Start may be recorded before ESP32 toolchain downloads. Reject old cached
    # build artifacts and future-dated compilers; CI should rebuild, not relabel.
    if compiled < begun - timedelta(minutes=15) or compiled > completed + timedelta(minutes=5):
        raise ValueError(
            f"Stale or future ESP32 APP compile timestamp {iso_utc(compiled)} "
            f"does not match this release build beginning {iso_utc(begun)}")
    return iso_utc(compiled)
