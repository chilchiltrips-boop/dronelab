#include "DroneGPS.h"

DroneGPS::DroneGPS(HardwareSerial &serialPort, int8_t rxPin, int8_t txPin)
    : _serial(serialPort), _rxPin(rxPin), _txPin(txPin)
{
}

bool DroneGPS::begin(
    Print *debugPort,
    uint32_t targetBaud,
    uint32_t initialBaud,
    uint8_t maxRetries,
    uint16_t ackTimeoutMs)
{
  _debug = debugPort;
  _maxRetries = maxRetries == 0 ? 1 : maxRetries;
  _ackTimeoutMs = ackTimeoutMs == 0 ? DEFAULT_ACK_TIMEOUT_MS : ackTimeoutMs;

  _data = DroneGPSData{};
  _messageCounters = DroneGPSMessageCounters{};
  _configReport = DroneGPSConfigReport{};
  _configReport.error = DroneGPSConfigError::NotStarted;
  _lastCompleteITOW = 0xFFFFFFFFUL;
  _lastCompleteEpochMs = 0;

#if defined(ESP32)
  _serial.setRxBufferSize(2048);
#endif

  log(F("[DroneGPS] Searching for u-blox receiver..."));

  // First try the desired baud. This avoids disturbing a receiver that is
  // already configured at 38400 baud.
  openSerial(targetBaud, 700);
  bool receiverAtTargetBaud = probeReceiver();

  if (!receiverAtTargetBaud)
  {
    if (initialBaud == targetBaud)
    {
      setConfigurationFailure(
          DroneGPSConfigError::ReceiverNotDetected,
          UBX_CLASS_CFG,
          UBX_CFG_RATE,
          DroneGPSAckResult::Timeout,
          _maxRetries);
      return false;
    }

    openSerial(initialBaud, 250);

    if (!probeReceiver())
    {
      setConfigurationFailure(
          DroneGPSConfigError::ReceiverNotDetected,
          UBX_CLASS_CFG,
          UBX_CFG_RATE,
          DroneGPSAckResult::Timeout,
          _maxRetries);
      return false;
    }

    if (!switchBaud(initialBaud, targetBaud))
    {
      setConfigurationFailure(
          DroneGPSConfigError::BaudSwitchFailed,
          UBX_CLASS_CFG,
          UBX_CFG_PRT,
          DroneGPSAckResult::Timeout,
          _maxRetries);
      return false;
    }
  }

  _configReport.activeBaud = targetBaud;

  // Reapply UART1 settings while already operating at the target baud.
  // ACK is reliable here because the baud rate is not changing.
  if (!configurePort(targetBaud))
  {
    return false;
  }

  // Mandatory drone setting: Airborne <2g, followed by readback verification.
  if (!setAirborne2g())
  {
    return false;
  }

  if (!verifyAirborne2g())
  {
    setConfigurationFailure(
        DroneGPSConfigError::Airborne2gReadbackFailed,
        UBX_CLASS_CFG,
        UBX_CFG_NAV5,
        DroneGPSAckResult::None,
        _maxRetries);
    _configReport.dynamicModelReadback = _lastNav5DynamicModel;
    return false;
  }

  _configReport.dynamicModelReadback = _lastNav5DynamicModel;

  if (!setRate10Hz())
  {
    return false;
  }

  if (!configureMessage(UBX_CLASS_NAV, UBX_NAV_POSLLH, 1))
  {
    setConfigurationFailure(
        DroneGPSConfigError::NavPosllhEnableFailed,
        UBX_CLASS_CFG,
        UBX_CFG_MSG,
        _ackResult,
        _configReport.attemptsUsed);
    return false;
  }

  if (!configureMessage(UBX_CLASS_NAV, UBX_NAV_VELNED, 1))
  {
    setConfigurationFailure(
        DroneGPSConfigError::NavVelnedEnableFailed,
        UBX_CLASS_CFG,
        UBX_CFG_MSG,
        _ackResult,
        _configReport.attemptsUsed);
    return false;
  }

  if (!configureMessage(UBX_CLASS_NAV, UBX_NAV_SOL, 1))
  {
    setConfigurationFailure(
        DroneGPSConfigError::NavSolEnableFailed,
        UBX_CLASS_CFG,
        UBX_CFG_MSG,
        _ackResult,
        _configReport.attemptsUsed);
    return false;
  }

  clearInput();
  resetParser();

  _configReport.success = true;
  _configReport.error = DroneGPSConfigError::None;
  _configReport.lastAck = DroneGPSAckResult::Ack;
  _configReport.failedClass = 0;
  _configReport.failedId = 0;

  log(F("[DroneGPS] Configuration complete."));
  log(F("[DroneGPS] UART1: 38400 baud, UBX output only."));
  log(F("[DroneGPS] CFG-NAV5: Airborne <2g verified."));
  log(F("[DroneGPS] Navigation rate: 10 Hz."));
  log(F("[DroneGPS] NAV-POSLLH, NAV-VELNED and NAV-SOL enabled."));

  return true;
}

void DroneGPS::update(uint16_t maxBytes)
{
  uint16_t processed = 0;
  while (processed < maxBytes && _serial.available() > 0)
  {
    const int value = _serial.read();
    if (value >= 0)
    {
      parseByte(static_cast<uint8_t>(value));
      ++processed;
    }
  }
}

const DroneGPSData &DroneGPS::data() const
{
  return _data;
}

bool DroneGPS::takeNewCompleteEpoch()
{
  if (!_data.newCompleteEpoch)
  {
    return false;
  }

  _data.newCompleteEpoch = false;
  return true;
}

bool DroneGPS::dataFresh() const
{
  return _lastCompleteEpochMs != 0 &&
         static_cast<uint32_t>(millis() - _lastCompleteEpochMs) <=
             _qualityLimits.dataTimeoutMs;
}

bool DroneGPS::readyForEkf() const
{
  return dataFresh() &&
         _data.fixValid &&
         _data.satellites >= _qualityLimits.minSatellites &&
         _data.horizontalAccuracyM <= _qualityLimits.maxHorizontalAccuracyM &&
         _data.speedAccuracyMps <= _qualityLimits.maxSpeedAccuracyMps &&
         _data.positionDOP <= _qualityLimits.maxPositionDOP;
}

void DroneGPS::setQualityLimits(const DroneGPSQualityLimits &limits)
{
  _qualityLimits = limits;
}

const DroneGPSQualityLimits &DroneGPS::qualityLimits() const
{
  return _qualityLimits;
}

const DroneGPSConfigReport &DroneGPS::configurationReport() const
{
  return _configReport;
}

bool DroneGPS::configurationOk() const
{
  return _configReport.success;
}

DroneGPSMessageCounters DroneGPS::takeMessageCounters()
{
  const DroneGPSMessageCounters result = _messageCounters;
  _messageCounters = DroneGPSMessageCounters{};
  return result;
}

uint32_t DroneGPS::lastCompleteEpochMillis() const
{
  return _lastCompleteEpochMs;
}

void DroneGPS::printData(Print &out) const
{
  out.println();
  out.println(F("========== DRONE GPS DATA =========="));

  out.print(F("Configuration: "));
  out.println(configurationOk() ? F("OK") : F("ERROR"));

  out.print(F("Fix valid: "));
  out.println(_data.fixValid ? F("YES") : F("NO"));

  out.print(F("Fix type: "));
  out.println(fixTypeText(_data.fixType));

  out.print(F("Satellites: "));
  out.println(_data.satellites);

  out.print(F("PDOP: "));
  out.println(_data.positionDOP, 2);

  out.print(F("Latitude: "));
  out.println(_data.latitude, 7);

  out.print(F("Longitude: "));
  out.println(_data.longitude, 7);

  out.print(F("Altitude MSL: "));
  out.print(_data.altitudeMSLM, 2);
  out.println(F(" m"));

  out.print(F("Horizontal accuracy: "));
  out.print(_data.horizontalAccuracyM, 2);
  out.println(F(" m"));

  out.print(F("Vertical accuracy: "));
  out.print(_data.verticalAccuracyM, 2);
  out.println(F(" m"));

  out.println(F("--- VELOCITY ---"));

  out.print(F("Velocity North: "));
  out.print(_data.velocityNorthMps, 3);
  out.println(F(" m/s"));

  out.print(F("Velocity East: "));
  out.print(_data.velocityEastMps, 3);
  out.println(F(" m/s"));

  out.print(F("Velocity Down: "));
  out.print(_data.velocityDownMps, 3);
  out.println(F(" m/s"));

  out.print(F("Ground speed: "));
  out.print(_data.groundSpeedMps, 3);
  out.println(F(" m/s"));

  out.print(F("3D speed: "));
  out.print(_data.speed3DMps, 3);
  out.println(F(" m/s"));

  out.print(F("Heading: "));
  out.print(_data.headingDegrees, 2);
  out.println(F(" deg"));

  out.print(F("Speed accuracy: "));
  out.print(_data.speedAccuracyMps, 3);
  out.println(F(" m/s"));

  out.print(F("Ready for EKF: "));
  out.println(readyForEkf() ? F("YES") : F("NO"));

  out.println(F("===================================="));
}

const char *DroneGPS::fixTypeText(uint8_t fixType)
{
  switch (fixType)
  {
    case 0: return "No fix";
    case 1: return "Dead reckoning";
    case 2: return "2D fix";
    case 3: return "3D fix";
    case 4: return "GNSS + dead reckoning";
    case 5: return "Time-only fix";
    default: return "Unknown";
  }
}

const char *DroneGPS::ackResultText(DroneGPSAckResult result)
{
  switch (result)
  {
    case DroneGPSAckResult::None: return "NONE";
    case DroneGPSAckResult::Waiting: return "WAITING";
    case DroneGPSAckResult::Ack: return "ACK-ACK";
    case DroneGPSAckResult::Nak: return "ACK-NAK";
    case DroneGPSAckResult::Timeout: return "TIMEOUT";
    default: return "UNKNOWN";
  }
}

const char *DroneGPS::configErrorText(DroneGPSConfigError error)
{
  switch (error)
  {
    case DroneGPSConfigError::NotStarted: return "Configuration not started";
    case DroneGPSConfigError::None: return "No error";
    case DroneGPSConfigError::ReceiverNotDetected: return "u-blox receiver not detected";
    case DroneGPSConfigError::BaudSwitchFailed: return "Baud-rate switch failed";
    case DroneGPSConfigError::PortConfigurationFailed: return "UART1 port configuration failed";
    case DroneGPSConfigError::Airborne2gAckFailed: return "CFG-NAV5 Airborne <2g was not acknowledged";
    case DroneGPSConfigError::Airborne2gReadbackFailed: return "CFG-NAV5 Airborne <2g readback verification failed";
    case DroneGPSConfigError::Rate10HzFailed: return "10 Hz navigation-rate configuration failed";
    case DroneGPSConfigError::NavPosllhEnableFailed: return "NAV-POSLLH enable failed";
    case DroneGPSConfigError::NavVelnedEnableFailed: return "NAV-VELNED enable failed";
    case DroneGPSConfigError::NavSolEnableFailed: return "NAV-SOL enable failed";
    default: return "Unknown configuration error";
  }
}

uint16_t DroneGPS::readU2(const uint8_t *bytes)
{
  return static_cast<uint16_t>(bytes[0]) |
         (static_cast<uint16_t>(bytes[1]) << 8);
}

uint32_t DroneGPS::readU4(const uint8_t *bytes)
{
  return static_cast<uint32_t>(bytes[0]) |
         (static_cast<uint32_t>(bytes[1]) << 8) |
         (static_cast<uint32_t>(bytes[2]) << 16) |
         (static_cast<uint32_t>(bytes[3]) << 24);
}

int32_t DroneGPS::readI4(const uint8_t *bytes)
{
  return static_cast<int32_t>(readU4(bytes));
}

void DroneGPS::writeU4(uint8_t *bytes, uint32_t value)
{
  bytes[0] = static_cast<uint8_t>(value & 0xFFU);
  bytes[1] = static_cast<uint8_t>((value >> 8) & 0xFFU);
  bytes[2] = static_cast<uint8_t>((value >> 16) & 0xFFU);
  bytes[3] = static_cast<uint8_t>((value >> 24) & 0xFFU);
}

void DroneGPS::openSerial(uint32_t baud, uint32_t startupDelayMs)
{
  _serial.end();
  delay(80);
  _serial.begin(baud, SERIAL_8N1, _rxPin, _txPin);
  delay(startupDelayMs);
  clearInput();
  resetParser();
  _configReport.activeBaud = baud;
}

void DroneGPS::clearInput()
{
  while (_serial.available() > 0)
  {
    _serial.read();
  }
}

void DroneGPS::resetParser()
{
  _parserState = ParserState::Sync1;
  _messageClass = 0;
  _messageId = 0;
  _messageLength = 0;
  _payloadIndex = 0;
  _discardRemaining = 0;
  _checksumA = 0;
  _checksumB = 0;
  _receivedChecksumA = 0;
}

void DroneGPS::prepareTransaction()
{
  // Parse any complete bytes already waiting instead of discarding a packet
  // midway. ACK and poll replies are matched by class/ID, so stale unrelated
  // navigation messages cannot complete the transaction.
  update();
  _ackWaiting = false;
  _ackResult = DroneGPSAckResult::None;
  _pollWaiting = false;
  _pollResponseReceived = false;
}

void DroneGPS::sendUBX(
    uint8_t ubxClass,
    uint8_t ubxId,
    const uint8_t *payload,
    uint16_t payloadLength)
{
  uint8_t checksumA = 0;
  uint8_t checksumB = 0;

  auto addChecksum = [&](uint8_t value)
  {
    checksumA = static_cast<uint8_t>(checksumA + value);
    checksumB = static_cast<uint8_t>(checksumB + checksumA);
  };

  _serial.write(0xB5);
  _serial.write(0x62);

  _serial.write(ubxClass);
  addChecksum(ubxClass);

  _serial.write(ubxId);
  addChecksum(ubxId);

  const uint8_t lengthLow = static_cast<uint8_t>(payloadLength & 0xFFU);
  const uint8_t lengthHigh = static_cast<uint8_t>((payloadLength >> 8) & 0xFFU);

  _serial.write(lengthLow);
  addChecksum(lengthLow);

  _serial.write(lengthHigh);
  addChecksum(lengthHigh);

  for (uint16_t index = 0; index < payloadLength; ++index)
  {
    const uint8_t value = payload[index];
    _serial.write(value);
    addChecksum(value);
  }

  _serial.write(checksumA);
  _serial.write(checksumB);
  _serial.flush();
}

DroneGPSAckResult DroneGPS::sendWithAck(
    uint8_t ubxClass,
    uint8_t ubxId,
    const uint8_t *payload,
    uint16_t payloadLength,
    uint8_t &attemptsUsed)
{
  attemptsUsed = 0;

  for (uint8_t attempt = 1; attempt <= _maxRetries; ++attempt)
  {
    attemptsUsed = attempt;
    prepareTransaction();

    _ackTargetClass = ubxClass;
    _ackTargetId = ubxId;
    _ackWaiting = true;
    _ackResult = DroneGPSAckResult::Waiting;

    sendUBX(ubxClass, ubxId, payload, payloadLength);

    const uint32_t startMs = millis();

    while (static_cast<uint32_t>(millis() - startMs) < _ackTimeoutMs)
    {
      update();

      if (_ackResult == DroneGPSAckResult::Ack)
      {
        _ackWaiting = false;
        return _ackResult;
      }

      if (_ackResult == DroneGPSAckResult::Nak)
      {
        // ACK-NAK is retryable, exactly like a timeout.
        break;
      }

      delay(1);
    }

    _ackWaiting = false;

    if (_ackResult == DroneGPSAckResult::Waiting)
    {
      _ackResult = DroneGPSAckResult::Timeout;
    }

    if (attempt < _maxRetries)
    {
      delay(50);
    }
  }

  return _ackResult;
}

bool DroneGPS::sendPollAndWait(
    uint8_t requestClass,
    uint8_t requestId,
    uint8_t responseClass,
    uint8_t responseId,
    uint16_t timeoutMs,
    uint8_t retries)
{
  const uint8_t attempts = retries == 0 ? 1 : retries;

  for (uint8_t attempt = 0; attempt < attempts; ++attempt)
  {
    prepareTransaction();

    _pollTargetClass = responseClass;
    _pollTargetId = responseId;
    _pollWaiting = true;
    _pollResponseReceived = false;

    sendUBX(requestClass, requestId, nullptr, 0);

    const uint32_t startMs = millis();

    while (static_cast<uint32_t>(millis() - startMs) < timeoutMs)
    {
      update();

      if (_pollResponseReceived)
      {
        _pollWaiting = false;
        return true;
      }

      delay(1);
    }

    _pollWaiting = false;
    delay(30);
  }

  return false;
}

bool DroneGPS::probeReceiver()
{
  const bool detected = sendPollAndWait(
      UBX_CLASS_CFG,
      UBX_CFG_RATE,
      UBX_CLASS_CFG,
      UBX_CFG_RATE,
      300,
      2);

  if (_debug != nullptr)
  {
    _debug->print(F("[DroneGPS] Probe at "));
    _debug->print(_configReport.activeBaud);
    _debug->print(F(" baud: "));
    _debug->println(detected ? F("OK") : F("no response"));
  }

  return detected;
}

bool DroneGPS::switchBaud(uint32_t oldBaud, uint32_t newBaud)
{
  (void)oldBaud;

  uint8_t payload[20] = {0};
  payload[0] = 0x01;             // UART1
  payload[4] = 0xD0;             // mode = 8N1 (0x000008D0)
  payload[5] = 0x08;
  writeU4(payload + 8, newBaud);
  payload[12] = 0x07;            // input: UBX + NMEA + RTCM
  payload[14] = 0x01;            // output: UBX only

  // CFG-PRT changes the receiver baud immediately. Its ACK may therefore be
  // transmitted at the new baud while the MCU is still using the old baud.
  // The switch is confirmed by reopening at newBaud and polling CFG-RATE.
  prepareTransaction();
  sendUBX(UBX_CLASS_CFG, UBX_CFG_PRT, payload, sizeof(payload));
  delay(120);

  openSerial(newBaud, 300);
  const bool switched = probeReceiver();

  if (_debug != nullptr)
  {
    _debug->print(F("[DroneGPS] Baud switch to "));
    _debug->print(newBaud);
    _debug->print(F(": "));
    _debug->println(switched ? F("verified") : F("failed"));
  }

  return switched;
}

bool DroneGPS::configurePort(uint32_t baud)
{
  uint8_t payload[20] = {0};
  payload[0] = 0x01;             // UART1
  payload[4] = 0xD0;             // mode = 8N1 (0x000008D0)
  payload[5] = 0x08;
  writeU4(payload + 8, baud);
  payload[12] = 0x07;            // input: UBX + NMEA + RTCM
  payload[14] = 0x01;            // output: UBX only (NMEA disabled on UART1)

  const bool success = runRequiredCommand(
      UBX_CLASS_CFG,
      UBX_CFG_PRT,
      payload,
      sizeof(payload),
      DroneGPSConfigError::PortConfigurationFailed);

  if (_debug != nullptr)
  {
    logAckResult(F("CFG-PRT UART1/UBX-only"), _configReport.lastAck, _configReport.attemptsUsed);
  }

  return success;
}

bool DroneGPS::setAirborne2g()
{
  uint8_t payload[36] = {0};

  // CFG-NAV5 mask bit 0: apply dynamic model only.
  payload[0] = 0x01;
  payload[1] = 0x00;
  payload[2] = 0x07;  // Dynamic model 7 = Airborne <2g.

  const bool success = runRequiredCommand(
      UBX_CLASS_CFG,
      UBX_CFG_NAV5,
      payload,
      sizeof(payload),
      DroneGPSConfigError::Airborne2gAckFailed);

  if (_debug != nullptr)
  {
    logAckResult(F("CFG-NAV5 Airborne <2g"), _configReport.lastAck, _configReport.attemptsUsed);
  }

  return success;
}

bool DroneGPS::verifyAirborne2g()
{
  _lastNav5DynamicModel = 0xFF;

  const bool responseReceived = sendPollAndWait(
      UBX_CLASS_CFG,
      UBX_CFG_NAV5,
      UBX_CLASS_CFG,
      UBX_CFG_NAV5,
      400,
      _maxRetries);

  const bool verified = responseReceived && _lastNav5DynamicModel == 0x07;

  if (_debug != nullptr)
  {
    _debug->print(F("[DroneGPS] CFG-NAV5 readback: "));
    if (!responseReceived)
    {
      _debug->println(F("timeout"));
    }
    else
    {
      _debug->print(F("dynamic model = "));
      _debug->print(_lastNav5DynamicModel);
      _debug->println(verified ? F(" (Airborne <2g)") : F(" (unexpected)"));
    }
  }

  return verified;
}

bool DroneGPS::setRate10Hz()
{
  const uint8_t payload[6] =
  {
    0x64, 0x00,  // measRate = 100 ms
    0x01, 0x00,  // navRate = 1 measurement cycle
    0x01, 0x00   // timeRef = GPS time
  };

  const bool success = runRequiredCommand(
      UBX_CLASS_CFG,
      UBX_CFG_RATE,
      payload,
      sizeof(payload),
      DroneGPSConfigError::Rate10HzFailed);

  if (_debug != nullptr)
  {
    logAckResult(F("CFG-RATE 10 Hz"), _configReport.lastAck, _configReport.attemptsUsed);
  }

  return success;
}

bool DroneGPS::configureMessage(
    uint8_t targetClass,
    uint8_t targetId,
    uint8_t uart1Rate)
{
  const uint8_t payload[8] =
  {
    targetClass,
    targetId,
    0,          // I2C
    uart1Rate,  // UART1
    0,          // UART2
    0,          // USB
    0,          // SPI
    0           // Reserved
  };

  uint8_t attemptsUsed = 0;
  const DroneGPSAckResult result = sendWithAck(
      UBX_CLASS_CFG,
      UBX_CFG_MSG,
      payload,
      sizeof(payload),
      attemptsUsed);

  _ackResult = result;
  _configReport.lastAck = result;
  _configReport.attemptsUsed = attemptsUsed;

  if (_debug != nullptr)
  {
    _debug->print(F("[DroneGPS] CFG-MSG 0x"));
    if (targetClass < 0x10) _debug->print('0');
    _debug->print(targetClass, HEX);
    _debug->print(F(" 0x"));
    if (targetId < 0x10) _debug->print('0');
    _debug->print(targetId, HEX);
    _debug->print(F(": "));
    _debug->print(ackResultText(result));
    _debug->print(F(" (attempt "));
    _debug->print(attemptsUsed);
    _debug->println(')');
  }

  return result == DroneGPSAckResult::Ack;
}

bool DroneGPS::runRequiredCommand(
    uint8_t commandClass,
    uint8_t commandId,
    const uint8_t *payload,
    uint16_t payloadLength,
    DroneGPSConfigError errorOnFailure)
{
  uint8_t attemptsUsed = 0;
  const DroneGPSAckResult result = sendWithAck(
      commandClass,
      commandId,
      payload,
      payloadLength,
      attemptsUsed);

  _configReport.lastAck = result;
  _configReport.attemptsUsed = attemptsUsed;

  if (result == DroneGPSAckResult::Ack)
  {
    return true;
  }

  setConfigurationFailure(
      errorOnFailure,
      commandClass,
      commandId,
      result,
      attemptsUsed);

  return false;
}

void DroneGPS::setConfigurationFailure(
    DroneGPSConfigError error,
    uint8_t failedClass,
    uint8_t failedId,
    DroneGPSAckResult ackResult,
    uint8_t attemptsUsed)
{
  _configReport.success = false;
  _configReport.error = error;
  _configReport.failedClass = failedClass;
  _configReport.failedId = failedId;
  _configReport.lastAck = ackResult;
  _configReport.attemptsUsed = attemptsUsed;

  if (_debug != nullptr)
  {
    _debug->print(F("[DroneGPS] CONFIGURATION ERROR: "));
    _debug->println(configErrorText(error));
  }
}

void DroneGPS::log(const __FlashStringHelper *text)
{
  if (_debug != nullptr)
  {
    _debug->println(text);
  }
}

void DroneGPS::logAckResult(
    const __FlashStringHelper *name,
    DroneGPSAckResult result,
    uint8_t attemptsUsed)
{
  if (_debug == nullptr)
  {
    return;
  }

  _debug->print(F("[DroneGPS] "));
  _debug->print(name);
  _debug->print(F(": "));
  _debug->print(ackResultText(result));
  _debug->print(F(" (attempt "));
  _debug->print(attemptsUsed);
  _debug->println(')');
}

void DroneGPS::updateParserChecksum(uint8_t value)
{
  _checksumA = static_cast<uint8_t>(_checksumA + value);
  _checksumB = static_cast<uint8_t>(_checksumB + _checksumA);
}

void DroneGPS::parseByte(uint8_t value)
{
  switch (_parserState)
  {
    case ParserState::Sync1:
      if (value == 0xB5)
      {
        _parserState = ParserState::Sync2;
      }
      break;

    case ParserState::Sync2:
      if (value == 0x62)
      {
        _checksumA = 0;
        _checksumB = 0;
        _parserState = ParserState::Class;
      }
      else if (value != 0xB5)
      {
        _parserState = ParserState::Sync1;
      }
      break;

    case ParserState::Class:
      _messageClass = value;
      updateParserChecksum(value);
      _parserState = ParserState::Id;
      break;

    case ParserState::Id:
      _messageId = value;
      updateParserChecksum(value);
      _parserState = ParserState::Length1;
      break;

    case ParserState::Length1:
      _messageLength = value;
      updateParserChecksum(value);
      _parserState = ParserState::Length2;
      break;

    case ParserState::Length2:
      _messageLength |= static_cast<uint16_t>(value) << 8;
      updateParserChecksum(value);
      _payloadIndex = 0;

      if (_messageLength > MAX_UBX_PAYLOAD)
      {
        _discardRemaining = static_cast<uint16_t>(_messageLength + 2U);
        _parserState = ParserState::Discard;
      }
      else if (_messageLength == 0)
      {
        _parserState = ParserState::ChecksumA;
      }
      else
      {
        _parserState = ParserState::Payload;
      }
      break;

    case ParserState::Payload:
      _payload[_payloadIndex++] = value;
      updateParserChecksum(value);

      if (_payloadIndex >= _messageLength)
      {
        _parserState = ParserState::ChecksumA;
      }
      break;

    case ParserState::ChecksumA:
      _receivedChecksumA = value;
      _parserState = ParserState::ChecksumB;
      break;

    case ParserState::ChecksumB:
      if (_receivedChecksumA == _checksumA && value == _checksumB)
      {
        processMessage();
      }
      _parserState = ParserState::Sync1;
      break;

    case ParserState::Discard:
      if (_discardRemaining > 0)
      {
        --_discardRemaining;
      }
      if (_discardRemaining == 0)
      {
        _parserState = ParserState::Sync1;
      }
      break;
  }
}

void DroneGPS::processMessage()
{
  if (_ackWaiting &&
      _messageClass == UBX_CLASS_ACK &&
      _messageLength == 2 &&
      _payload[0] == _ackTargetClass &&
      _payload[1] == _ackTargetId)
  {
    if (_messageId == UBX_ACK_ACK)
    {
      _ackResult = DroneGPSAckResult::Ack;
    }
    else if (_messageId == UBX_ACK_NAK)
    {
      _ackResult = DroneGPSAckResult::Nak;
    }
  }

  if (_messageClass == UBX_CLASS_CFG &&
      _messageId == UBX_CFG_NAV5 &&
      _messageLength == 36)
  {
    _lastNav5DynamicModel = _payload[2];
  }

  if (_pollWaiting &&
      _messageClass == _pollTargetClass &&
      _messageId == _pollTargetId)
  {
    _pollResponseReceived = true;
  }

  if (_messageClass != UBX_CLASS_NAV)
  {
    return;
  }

  if (_messageId == UBX_NAV_POSLLH)
  {
    parseNavPosllh(_payload, _messageLength);
  }
  else if (_messageId == UBX_NAV_VELNED)
  {
    parseNavVelned(_payload, _messageLength);
  }
  else if (_messageId == UBX_NAV_SOL)
  {
    parseNavSol(_payload, _messageLength);
  }
}

void DroneGPS::parseNavPosllh(const uint8_t *payload, uint16_t length)
{
  if (length != 28)
  {
    return;
  }

  _data.positionITOW = readU4(payload + 0);
  _data.longitude = static_cast<double>(readI4(payload + 4)) * 1e-7;
  _data.latitude = static_cast<double>(readI4(payload + 8)) * 1e-7;
  _data.heightEllipsoidM = readI4(payload + 12) / 1000.0f;
  _data.altitudeMSLM = readI4(payload + 16) / 1000.0f;
  _data.horizontalAccuracyM = readU4(payload + 20) / 1000.0f;
  _data.verticalAccuracyM = readU4(payload + 24) / 1000.0f;
  _data.positionReceived = true;

  ++_messageCounters.navPosllh;
  tryCompleteEpoch();
}

void DroneGPS::parseNavVelned(const uint8_t *payload, uint16_t length)
{
  if (length != 36)
  {
    return;
  }

  _data.velocityITOW = readU4(payload + 0);
  _data.velocityNorthMps = readI4(payload + 4) / 100.0f;
  _data.velocityEastMps = readI4(payload + 8) / 100.0f;
  _data.velocityDownMps = readI4(payload + 12) / 100.0f;
  _data.speed3DMps = readU4(payload + 16) / 100.0f;
  _data.groundSpeedMps = readU4(payload + 20) / 100.0f;
  _data.headingDegrees = readI4(payload + 24) * 1e-5f;
  _data.speedAccuracyMps = readU4(payload + 28) / 100.0f;
  _data.headingAccuracyDegrees = readU4(payload + 32) * 1e-5f;
  _data.velocityReceived = true;

  ++_messageCounters.navVelned;
  tryCompleteEpoch();
}

void DroneGPS::parseNavSol(const uint8_t *payload, uint16_t length)
{
  if (length != 52)
  {
    return;
  }

  _data.solutionITOW = readU4(payload + 0);
  _data.fixType = payload[10];
  _data.fixFlags = payload[11];
  _data.positionDOP = readU2(payload + 44) * 0.01f;
  _data.satellites = payload[47];

  const bool gpsFixOK = (_data.fixFlags & 0x01U) != 0;
  const bool valid3DFix = _data.fixType == 3 || _data.fixType == 4;
  _data.fixValid = gpsFixOK && valid3DFix;
  _data.solutionReceived = true;

  ++_messageCounters.navSol;
  tryCompleteEpoch();
}

void DroneGPS::tryCompleteEpoch()
{
  if (!_data.positionReceived ||
      !_data.velocityReceived ||
      !_data.solutionReceived)
  {
    return;
  }

  if (_data.positionITOW != _data.velocityITOW ||
      _data.positionITOW != _data.solutionITOW)
  {
    return;
  }

  if (_data.positionITOW == _lastCompleteITOW)
  {
    return;
  }

  _lastCompleteITOW = _data.positionITOW;
  _lastCompleteEpochMs = millis();
  _data.newCompleteEpoch = true;
  ++_messageCounters.completeEpochs;
}
