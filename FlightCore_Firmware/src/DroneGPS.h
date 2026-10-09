#pragma once

#include <Arduino.h>

struct DroneGPSData
{
  uint32_t positionITOW = 0;
  uint32_t velocityITOW = 0;
  uint32_t solutionITOW = 0;

  double latitude = 0.0;
  double longitude = 0.0;

  float heightEllipsoidM = 0.0f;
  float altitudeMSLM = 0.0f;

  float horizontalAccuracyM = 0.0f;
  float verticalAccuracyM = 0.0f;

  float velocityNorthMps = 0.0f;
  float velocityEastMps = 0.0f;
  float velocityDownMps = 0.0f;

  float groundSpeedMps = 0.0f;
  float speed3DMps = 0.0f;
  float headingDegrees = 0.0f;

  float speedAccuracyMps = 0.0f;
  float headingAccuracyDegrees = 0.0f;

  uint8_t fixType = 0;
  uint8_t fixFlags = 0;
  uint8_t satellites = 0;

  float positionDOP = 0.0f;

  bool fixValid = false;
  bool positionReceived = false;
  bool velocityReceived = false;
  bool solutionReceived = false;
  bool newCompleteEpoch = false;
};

struct DroneGPSQualityLimits
{
  uint8_t minSatellites = 6;
  float maxHorizontalAccuracyM = 5.0f;
  float maxSpeedAccuracyMps = 1.0f;
  float maxPositionDOP = 4.0f;
  uint32_t dataTimeoutMs = 500;
};

struct DroneGPSMessageCounters
{
  uint16_t navPosllh = 0;
  uint16_t navVelned = 0;
  uint16_t navSol = 0;
  uint16_t completeEpochs = 0;
};

enum class DroneGPSAckResult : uint8_t
{
  None,
  Waiting,
  Ack,
  Nak,
  Timeout
};

enum class DroneGPSConfigError : uint8_t
{
  NotStarted,
  None,
  ReceiverNotDetected,
  BaudSwitchFailed,
  PortConfigurationFailed,
  Airborne2gAckFailed,
  Airborne2gReadbackFailed,
  Rate10HzFailed,
  NavPosllhEnableFailed,
  NavVelnedEnableFailed,
  NavSolEnableFailed
};

struct DroneGPSConfigReport
{
  bool success = false;
  DroneGPSConfigError error = DroneGPSConfigError::NotStarted;
  DroneGPSAckResult lastAck = DroneGPSAckResult::None;
  uint8_t failedClass = 0;
  uint8_t failedId = 0;
  uint8_t attemptsUsed = 0;
  uint8_t dynamicModelReadback = 0xFF;
  uint32_t activeBaud = 0;
};

class DroneGPS
{
public:
  static constexpr uint32_t DEFAULT_INITIAL_BAUD = 9600;
  static constexpr uint32_t DEFAULT_TARGET_BAUD = 38400;
  static constexpr uint16_t DEFAULT_ACK_TIMEOUT_MS = 350;
  static constexpr uint8_t DEFAULT_MAX_RETRIES = 3;

  DroneGPS(HardwareSerial &serialPort, int8_t rxPin, int8_t txPin);

  bool begin(
      Print *debugPort = nullptr,
      uint32_t targetBaud = DEFAULT_TARGET_BAUD,
      uint32_t initialBaud = DEFAULT_INITIAL_BAUD,
      uint8_t maxRetries = DEFAULT_MAX_RETRIES,
      uint16_t ackTimeoutMs = DEFAULT_ACK_TIMEOUT_MS);

  void update(uint16_t maxBytes = 96); // Keep UART parsing within the 250 Hz flight-loop budget.

  const DroneGPSData &data() const;
  bool takeNewCompleteEpoch();
  bool readyForEkf() const;
  bool dataFresh() const;

  void setQualityLimits(const DroneGPSQualityLimits &limits);
  const DroneGPSQualityLimits &qualityLimits() const;

  const DroneGPSConfigReport &configurationReport() const;
  bool configurationOk() const;

  DroneGPSMessageCounters takeMessageCounters();
  uint32_t lastCompleteEpochMillis() const;

  void printData(Print &out) const;

  static const char *fixTypeText(uint8_t fixType);
  static const char *ackResultText(DroneGPSAckResult result);
  static const char *configErrorText(DroneGPSConfigError error);

private:
  static constexpr uint16_t MAX_UBX_PAYLOAD = 128;
  static constexpr uint8_t UBX_CLASS_ACK = 0x05;
  static constexpr uint8_t UBX_CLASS_CFG = 0x06;
  static constexpr uint8_t UBX_CLASS_NAV = 0x01;

  static constexpr uint8_t UBX_ACK_NAK = 0x00;
  static constexpr uint8_t UBX_ACK_ACK = 0x01;

  static constexpr uint8_t UBX_CFG_PRT = 0x00;
  static constexpr uint8_t UBX_CFG_MSG = 0x01;
  static constexpr uint8_t UBX_CFG_RATE = 0x08;
  static constexpr uint8_t UBX_CFG_NAV5 = 0x24;

  static constexpr uint8_t UBX_NAV_POSLLH = 0x02;
  static constexpr uint8_t UBX_NAV_SOL = 0x06;
  static constexpr uint8_t UBX_NAV_VELNED = 0x12;

  enum class ParserState : uint8_t
  {
    Sync1,
    Sync2,
    Class,
    Id,
    Length1,
    Length2,
    Payload,
    ChecksumA,
    ChecksumB,
    Discard
  };

  HardwareSerial &_serial;
  Print *_debug = nullptr;
  int8_t _rxPin;
  int8_t _txPin;

  DroneGPSData _data;
  DroneGPSQualityLimits _qualityLimits;
  DroneGPSConfigReport _configReport;
  DroneGPSMessageCounters _messageCounters;

  ParserState _parserState = ParserState::Sync1;
  uint8_t _messageClass = 0;
  uint8_t _messageId = 0;
  uint16_t _messageLength = 0;
  uint16_t _payloadIndex = 0;
  uint16_t _discardRemaining = 0;
  uint8_t _checksumA = 0;
  uint8_t _checksumB = 0;
  uint8_t _receivedChecksumA = 0;
  uint8_t _payload[MAX_UBX_PAYLOAD] = {0};

  bool _ackWaiting = false;
  uint8_t _ackTargetClass = 0;
  uint8_t _ackTargetId = 0;
  DroneGPSAckResult _ackResult = DroneGPSAckResult::None;

  bool _pollWaiting = false;
  uint8_t _pollTargetClass = 0;
  uint8_t _pollTargetId = 0;
  bool _pollResponseReceived = false;

  uint8_t _lastNav5DynamicModel = 0xFF;
  uint32_t _lastCompleteITOW = 0xFFFFFFFFUL;
  uint32_t _lastCompleteEpochMs = 0;

  uint8_t _maxRetries = DEFAULT_MAX_RETRIES;
  uint16_t _ackTimeoutMs = DEFAULT_ACK_TIMEOUT_MS;

  static uint16_t readU2(const uint8_t *bytes);
  static uint32_t readU4(const uint8_t *bytes);
  static int32_t readI4(const uint8_t *bytes);
  static void writeU4(uint8_t *bytes, uint32_t value);

  void openSerial(uint32_t baud, uint32_t startupDelayMs);
  void clearInput();
  void resetParser();
  void prepareTransaction();

  void sendUBX(
      uint8_t ubxClass,
      uint8_t ubxId,
      const uint8_t *payload,
      uint16_t payloadLength);

  DroneGPSAckResult sendWithAck(
      uint8_t ubxClass,
      uint8_t ubxId,
      const uint8_t *payload,
      uint16_t payloadLength,
      uint8_t &attemptsUsed);

  bool sendPollAndWait(
      uint8_t requestClass,
      uint8_t requestId,
      uint8_t responseClass,
      uint8_t responseId,
      uint16_t timeoutMs,
      uint8_t retries);

  bool probeReceiver();
  bool switchBaud(uint32_t oldBaud, uint32_t newBaud);
  bool configurePort(uint32_t baud);
  bool setAirborne2g();
  bool verifyAirborne2g();
  bool setRate10Hz();
  bool configureMessage(uint8_t targetClass, uint8_t targetId, uint8_t uart1Rate);

  bool runRequiredCommand(
      uint8_t commandClass,
      uint8_t commandId,
      const uint8_t *payload,
      uint16_t payloadLength,
      DroneGPSConfigError errorOnFailure);

  void setConfigurationFailure(
      DroneGPSConfigError error,
      uint8_t failedClass,
      uint8_t failedId,
      DroneGPSAckResult ackResult,
      uint8_t attemptsUsed);

  void log(const __FlashStringHelper *text);
  void logAckResult(
      const __FlashStringHelper *name,
      DroneGPSAckResult result,
      uint8_t attemptsUsed);

  void updateParserChecksum(uint8_t value);
  void parseByte(uint8_t value);
  void processMessage();

  void parseNavPosllh(const uint8_t *payload, uint16_t length);
  void parseNavVelned(const uint8_t *payload, uint16_t length);
  void parseNavSol(const uint8_t *payload, uint16_t length);
  void tryCompleteEpoch();
};
