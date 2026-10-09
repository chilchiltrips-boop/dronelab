#pragma once
// Dedicated networking task: a slow HTTP request cannot stall Android RC.
WiFiUDP rcUdp;
TaskHandle_t rcUdpTaskHandle=nullptr;
uint64_t rcUdpToken=0;
uint32_t rcUdpLastSequence=0;
bool rcUdpSequenceSeen=false;
bool rcUdpSimulation=false;
uint32_t rcUdpReceived=0,rcUdpAccepted=0,rcUdpRejected=0;const char* rcUdpLastReject="";
void invalidateRcUdp(){
 portENTER_CRITICAL(&stateMux);rcUdpToken=0;rcUdpSequenceSeen=false;rcUdpSimulation=false;portEXIT_CRITICAL(&stateMux);
}
String rcUdpGrantJson(){
 uint64_t token;bool simulation;portENTER_CRITICAL(&stateMux);token=rcUdpToken;simulation=rcUdpSimulation;portEXIT_CRITICAL(&stateMux);
 char encoded[17];snprintf(encoded,sizeof(encoded),"%016llx",(unsigned long long)token);
 return String(",\"rcUdpPort\":")+String(token?RcUdpProtocol::PORT:0)+",\"rcUdpToken\":\""+(token?String(encoded):String(""))+"\",\"rcUdpHz\":50,\"rcProtocol\":\""+String(simulation?"ZRC2":"ZRC1")+"\"";
}
void rcUdpTask(void*){
 const uint64_t key=ESP.getEfuseMac()&0xFFFFFFFFFFFFULL;
 for(;;){
  for(int count=0;count<8;count++){
   int size=rcUdp.parsePacket();if(size<=0)break;
   rcUdpReceived++;uint8_t packet[88],bytes[RcUdpProtocol::FRAME_BYTES];uint64_t secureSid=0;int read=rcUdp.read(packet,sizeof(packet));
   if(!secureRcOpen(packet,read,bytes,secureSid)){rcUdpRejected++;rcUdpLastReject="Secure RC authentication failed";continue;}
   RcUdpProtocol::Frame frame;if(size!=88||!RcUdpProtocol::decode(bytes,sizeof(bytes),frame)||frame.device!=key){rcUdpRejected++;rcUdpLastReject="Invalid frame or Device ID";continue;}
   uint32_t now=millis();bool accepted=false,actualArmed=false,ready=false;
   portENTER_CRITICAL(&stateMux);
   if((FLIGHT_CONTROL_ENABLED||trainingActive)&&rcUdpToken&&frame.token==rcUdpToken&&RcUdpProtocol::permitted(frame,rcUdpSimulation,trainingActive,trainingAppOwned&&trainingInput==1)&&(int32_t)(controlExpiresAt-now)>0&&benchMode==BENCH_NONE&&!fcSetupActive&&!configurationBusy&&!firmwareUploadActive&&(!rcUdpSequenceSeen||RcUdpProtocol::newer(frame.sequence,rcUdpLastSequence))){
    for(int i=0;i<10;i++)webRcCh[i]=frame.channels[i];
    webRcLastMs=now;webRcFrames++;controlExpiresAt=now+LOCK_TIMEOUT_MS;
    if(trainingActive&&trainingAppOwned&&trainingInput==1)trainingExpires=now+10000;
    rcUdpLastSequence=frame.sequence;rcUdpSequenceSeen=true;accepted=true;rcUdpAccepted++;actualArmed=armed;ready=flightReady||trainingActive;
   }
   if(!accepted){rcUdpRejected++;rcUdpLastReject=!rcUdpToken||frame.token!=rcUdpToken?"Grant expired / changed":!RcUdpProtocol::permitted(frame,rcUdpSimulation,trainingActive,trainingAppOwned&&trainingInput==1)?"Wrong RC mode / simulation ended":(int32_t)(controlExpiresAt-now)<=0?"Control lease expired":benchMode!=BENCH_NONE||fcSetupActive||configurationBusy||firmwareUploadActive?"Setup / outputs inhibit RC":"Replayed sequence";}
   portEXIT_CRITICAL(&stateMux);
   if(accepted){uint8_t ack[RcUdpProtocol::ACK_BYTES];RcUdpProtocol::ack(ack,frame,actualArmed,ready);rcUdp.beginPacket(rcUdp.remoteIP(),rcUdp.remotePort());uint8_t encrypted[68];if(secureRcAck(secureSid,ack,encrypted))rcUdp.write(encrypted,sizeof(encrypted));rcUdp.endPacket();}
  }
  vTaskDelay(pdMS_TO_TICKS(2));
 }
}
String rcTransportJson(){return String(",\"rcTransport\":{\"udpListening\":")+String(rcUdpTaskHandle?"true":"false")+",\"protocol\":\""+String(rcUdpToken?(rcUdpSimulation?"ZRC2":"ZRC1"):"HTTP / idle")+"\",\"udpReceived\":"+String(rcUdpReceived)+",\"udpAccepted\":"+String(rcUdpAccepted)+",\"udpRejected\":"+String(rcUdpRejected)+",\"lastReject\":\""+String(rcUdpLastReject)+"\"}";}
void startRcUdp(){
 if(rcUdpTaskHandle||!ALLOW_WEB_RC)return;
 if(!rcUdp.begin(RcUdpProtocol::PORT))return;
 if(xTaskCreate(rcUdpTask,"aerion-rc-udp",4096,nullptr,2,&rcUdpTaskHandle)!=pdPASS){rcUdp.stop();rcUdpTaskHandle=nullptr;}
}
