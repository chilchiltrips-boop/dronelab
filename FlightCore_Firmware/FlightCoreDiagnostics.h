#pragma once
// Scalar Wi-Fi counters only. Associated client MACs never leave this bounded cache.
static volatile uint32_t zjApStartCount=0,zjApStopCount=0,zjApJoinCount=0,zjApLeaveCount=0,zjWifiLastEventAt=0,zjApReconnectCount=0;
static volatile uint8_t zjApDisconnectReason=0;
static uint64_t zjApSeenClients[8]={};
static void zjApClientJoined(const uint8_t* mac){
 uint64_t id=0;for(uint8_t i=0;i<6;i++)id=(id<<8)|mac[i];
 for(auto seen:zjApSeenClients)if(seen==id){zjApReconnectCount=zjApReconnectCount+1;return;}
 for(auto& seen:zjApSeenClients)if(!seen){seen=id;return;}
}
static uint32_t zjMainLoopAt=0,zjMaxMainLoopGapMs=0,zjWifiModeChanges=0,zjApSignalAt=0;
static int16_t zjApClientRssi=-128;
static uint8_t zjApClientCount=0,zjLastWifiMode=255;
static String zjWifiStatistics(){
 return String("{\"apStarts\":")+String(zjApStartCount)+",\"apStops\":"+String(zjApStopCount)+
  ",\"apJoins\":"+String(zjApJoinCount)+",\"apLeaves\":"+String(zjApLeaveCount)+
  ",\"apDisconnectReason\":"+String(zjApDisconnectReason)+",\"activeApClients\":"+String(zjApClientCount)+
  ",\"modeTransitions\":"+String(zjWifiModeChanges)+",\"lastEventAtMs\":"+String(zjWifiLastEventAt)+
  ",\"apClientRssiDbm\":"+(zjApClientRssi==-128?String("null"):String(zjApClientRssi))+
  ",\"radioResetCount\":null,\"reconnectCount\":"+String(zjApReconnectCount)+"}";
}
