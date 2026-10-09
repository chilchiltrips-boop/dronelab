@echo off
cd /d "%~dp0"
echo ZEBJUS DroneLab V1.2.0 - One-Scan Local Bridge
echo Ensure laptop and Android use the same Wi-Fi.
start "ZEBJUS Local Bridge" cmd /k "py -3 tools\local_pair_server.py"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8765/#settings"
