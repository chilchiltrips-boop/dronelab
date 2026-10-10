# A1/A2 live gyro readings in ZEBJUS Python Lab

Select **Python Lab → Python project examples… → A1/A2 Gyroscope • RateRoll/Pitch/Yaw**. Connect the **running USB Serial port at 115200 baud** before pressing Run. Press Stop to terminate the loop.

The same browser example works on **ZEBJUS FlightCore A1 SuperMini (ESP32-C3, LSM6DS3, 0x6B, SDA4/SCL5)** and **ZEBJUS FlightCore A2 C6 (XIAO ESP32-C6, MPU6050, 0x68, SDA22/SCL23)**. Firmware v1.3.0 sends `ZJTEL` frames at 20 Hz by default, with 10 and 50 Hz options; the example prints approximately 10 lines/second rather than flooding the terminal.

```python
from zebjus_simple import Drone
import asyncio

drone = Drone()
while True:
    gyro = await drone.read_gyro(timeout=3000)
    RateRoll = gyro["RateRoll"]
    RatePitch = gyro["RatePitch"]
    RateYaw = gyro["RateYaw"]
    print(gyro["board"], gyro["sensor"], gyro["address"],
          RateRoll, RatePitch, RateYaw, "deg/s")
    await asyncio.sleep(0.1)
```

`read_gyro()` **awaits the next real USB frame**; it does not return synthetic data or fixed board names. The result includes `board`, `boardId`, `sensor`, `address`, `RateRoll`, `RatePitch`, `RateYaw`, `status`, `timestamp`, `sequence`, `boardMs`, `deviceDrops`, and `units`. All rates are **degrees per second** (angular velocity), NOT integrated tilt angles. There is no calibration or tilt estimation in this Python example.

Extra sensors (barometer, magnetometer, etc.) can coexist on I2C if each has a distinct bus address and appropriate electrical connections. `drone.i2c_scan()` continues to list *all* connected addresses independently of gyroscope acquisition. **Listing an address does not automatically add a firmware driver or readings for that other sensor**. Gyro data is accepted only for A1 LSM6DS3 at 0x6B or A2 MPU6050 at 0x68; anything else is excluded. Keep the combined I2C bus within electrical specifications, use 3.3V-level logic and compatible pull-ups; duplicate 7-bit addresses require a mux or separate bus.

A new read fails if the sensor reports NOT_FOUND/READ_ERROR, if USB is disconnected, or if no new valid gyro sample appears within the specified timeout. The Python worker stops on uncaught error; hardware/control errors use the existing UI traceback diagnostics.

**Desktop PyCharm** cannot import the browser-only `zebjus_simple` directly. For desktop Python use `FlightCore_Firmware/PC_GYRO_SERIAL_EXAMPLE.py` with `pip install pyserial` and the board's serial port. Close the WebApp Serial Monitor before opening the same port in PyCharm.

These functions read diagnostic sensor telemetry only. They do not enable arm/disarm, motor output, or direct flight-controller control. Test with motors disconnected.
