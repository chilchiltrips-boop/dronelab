#pragma once
// Reason-aware STA association policy. The most-recently saved / manually
// preferred profile is index zero; only credentials successfully tested over
// the radio are committed to NVS.
static uint32_t zjSavedAttemptTimeoutMs(uint8_t reason){
 // ESP32 Wi-Fi disconnect reason codes: 201 NO_AP_FOUND, 202 AUTH_FAIL,
 // 203 ASSOC_FAIL, 204 HANDSHAKE_TIMEOUT. Never treat intentional 36 as auth.
 if(reason==201)return 6000;
 if(reason==202||reason==203)return 8500;
 if(reason==204)return 12000;
 return 20000;
}
static uint32_t zjSavedRetryDelayMs(uint8_t reason){
 if(reason==202||reason==203)return 60000; // bad auth: don't hammer access point
 if(reason==201)return 20000; // missing router: scan again when environment changes
 return 30000;
}
static bool zjSavedPreferredFirst(int index){return index==0;}
