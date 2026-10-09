#include <Wire.h>

// Board identity and firmware version shown in the Serial Monitor.
static const char* FW_VERSION = "1.0.0";
#if defined(CONFIG_IDF_TARGET_ESP32C3)
static const char* BOARD_ID = "ZFC-A1";
static const char* BOARD_NAME = "Aerion FC A1";
#elif defined(CONFIG_IDF_TARGET_ESP32C6)
static const char* BOARD_ID = "ZFC-A2";
static const char* BOARD_NAME = "Aerion FC A2";
#else
#error "Build this scanner for ESP32-C3 Super Mini or Seeed XIAO ESP32-C6."
#endif

void setup() {
  Serial.begin(115200);
  Wire.begin();          // SDA/SCL default pins
  Serial.println("\n=== I2C Address Scanner ===");
  Serial.print("Board: "); Serial.print(BOARD_NAME);
  Serial.print(" ["); Serial.print(BOARD_ID); Serial.println("]");
  Serial.print("Firmware version: "); Serial.println(FW_VERSION);
  Serial.print("SDA GPIO "); Serial.print(SDA);
  Serial.print(" | SCL GPIO "); Serial.println(SCL);
  delay(1000);
}

void loop() {
  byte error, address;
  int deviceCount = 0;

  Serial.println("Scanning I2C bus...\n");

  for (address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("✔ Found device at 0x");
      if (address < 16)
        Serial.print("0");
      Serial.println(address, HEX);
      deviceCount++;
    } else if (error == 4) {
      Serial.print("⚠ Unknown error at 0x");
      if (address < 16)
        Serial.print("0");
      Serial.println(address, HEX);
    }
  }

  if (deviceCount == 0)
    Serial.println("❌ No I2C devices found.\n");
  else {
    Serial.print("\n✅ Total I2C devices found: ");
    Serial.println(deviceCount);
  }

  Serial.println("\n-----------------------------\n");
  delay(5000);   // Scan every 5 seconds
}
