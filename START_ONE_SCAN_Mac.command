#!/bin/zsh
cd -- "$(dirname "$0")"
echo "ZEBJUS DroneLab v1.2.0 • One-Scan Local Bridge"
echo "Connect laptop and Android phone to the same Wi-Fi."
echo "If the laptop IP is incorrect, run: python3 tools/local_pair_server.py --lan-ip 192.168.1.XX"
python3 tools/local_pair_server.py &
PID=$!
sleep 2
open "http://localhost:8765/#settings"
wait $PID
