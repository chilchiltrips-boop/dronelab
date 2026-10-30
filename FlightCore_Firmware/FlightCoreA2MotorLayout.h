#pragma once
#include <stdint.h>

// Shared logical layout. digitalPin is the XIAO D-label, not the GPIO number.
// FlightCoreMotor.h configures the A2 hardware driver for this fixed preset.
enum class ZjMotorPosition : uint8_t { FRONT_LEFT, FRONT_RIGHT, BACK_RIGHT, BACK_LEFT };
enum class ZjMotorRotation : uint8_t { CLOCKWISE, COUNTERCLOCKWISE };
struct ZjA2MotorLayoutEntry {
  uint8_t motor;
  uint8_t digitalPin;
  ZjMotorPosition position;
  ZjMotorRotation rotation;
};

// Direction is specified looking down at the aircraft from above.
static constexpr ZjA2MotorLayoutEntry ZJ_A2_MOTOR_LAYOUT[4] = {
  {1, 0, ZjMotorPosition::FRONT_LEFT,  ZjMotorRotation::CLOCKWISE},
  {2, 1, ZjMotorPosition::FRONT_RIGHT, ZjMotorRotation::COUNTERCLOCKWISE},
  {3, 2, ZjMotorPosition::BACK_RIGHT,  ZjMotorRotation::CLOCKWISE},
  {4, 3, ZjMotorPosition::BACK_LEFT,   ZjMotorRotation::COUNTERCLOCKWISE},
};
