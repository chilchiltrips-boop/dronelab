# Scanner release checks · 1.0.0

- GitHub Actions [scanner build](https://github.com/chilchiltrips-boop/dronelab/actions/runs/37896723040) compiled A1 with `esp32:esp32:esp32c3` and A2 with `esp32:esp32:XIAO_ESP32C6` using Arduino ESP32 core 3.3.12.
- A1 APP: 308,464 bytes, ESP image chip ID 5. A2 APP: 283,344 bytes, chip ID 13. Both merged Factory images are 4,194,304 bytes.
- `tools/verify_release.py` checks catalog SHA-256 and size, ESP magic and chip, embedded 1.0.0 version, complete Factory bootloader, 0x10000/0x1f0000 application slots and byte-identical APP embedded in Factory. Build job passed.
- `npm test` covers the Assembly Lab and 2D Wiring regressions plus scanner source/image/USB guards. Software checks do not prove physical scanning or USB flashing.
- Hosted desktop page checked at 1363×936: both board selections and all four downloads loaded with matching catalog SHA-256, byte size and MATCH badge; Flash remained disabled without a connected USB target. Serial Monitor control and Assembly/Wiring navigation were present. No application console error was observed; only the cloud browser extension emitted metadata errors. Actual A1/A2 ports were unavailable here.
