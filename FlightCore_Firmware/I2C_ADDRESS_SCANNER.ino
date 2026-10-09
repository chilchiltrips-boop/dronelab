#include <Wire.h>

void setup() {
  Serial.begin(115200);
  Wire.begin();          // SDA/SCL default pins
  Serial.println("\n=== I2C Address Scanner ===");
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
