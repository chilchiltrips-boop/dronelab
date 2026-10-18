#pragma once
// ZJUDP1 diagnostic-only encrypted RC receiver. Never drives ESC/motor outputs.
// Source indices: CH0 throttle, CH1 roll, CH2 pitch, CH3 yaw,
// CH4 AUX1 reserved, CH5 AUX2 reserved, FLAGS bit0 diagnostic input ARM.
// Authenticated framing: 16B AAD header (magic "ZJU1", 8B claim token,
// uint32 big-endian sequence), 12B unique nonce, 14B encrypted channels,
// 16B AES-256-GCM tag = 58B. ACK uses the same length; ACK indices:
// 0 seq (u32), 1 received (u32), 2 rejected (u32), 3 flags (u8),
// 4 packet age (u8), with the remaining 14-byte plaintext reserved as specified.
// Key = HMAC_SHA256(existing signed HTTP auth key, "ZJUDP1|deviceId|rcClaimToken").
// HTTP pairing/claim owns authorization; there is no raw UDP key endpoint.
#include <WiFiUdp.h>
#include <mbedtls/gcm.h>
static constexpr uint16_t ZJ_UDP_PORT=4210;
static constexpr size_t ZJ_UDP_SIZE=58;
static WiFiUDP zjUdpSocket;
static TaskHandle_t zjUdpTaskHandle=nullptr;
static portMUX_TYPE zjUdpMux=portMUX_INITIALIZER_UNLOCKED;
static bool zjUdpActive=false,zjUdpConfigured=false,zjUdpHasPending=false,zjUdpRequestedArm=false;
static uint8_t zjUdpKey[32]={},zjUdpToken[8]={},zjUdpOwner[4]={};
static uint32_t zjUdpLastSeq=0,zjUdpLastRx=0,zjUdpBoundAt=0,zjUdpReceived=0,zjUdpRejected=0;
static uint32_t zjUdpPendingSeq=0,zjUdpPendingAt=0;
// A claim/release can run while the receiver authenticates outside the lock.
// Only that exact grant may publish a frame, rejection or timeout afterward.
static uint32_t zjUdpGeneration=0;
static uint16_t zjUdpPendingChannels[6]={};
static bool zjUdpPendingArmed=false;
static uint32_t zjUdpGet32(const uint8_t* p){
 return (uint32_t(p[0])<<24)|(uint32_t(p[1])<<16)|(uint32_t(p[2])<<8)|p[3];
}
static void zjUdpPut32(uint8_t* p,uint32_t n){
 p[0]=n>>24;p[1]=n>>16;p[2]=n>>8;p[3]=n;
}
static bool zjUdpGcm(bool encrypt,const uint8_t key[32],const uint8_t* source,uint8_t* payload){
 mbedtls_gcm_context ctx;mbedtls_gcm_init(&ctx);
 int err=mbedtls_gcm_setkey(&ctx,MBEDTLS_CIPHER_ID_AES,key,256);
 if(!err){
  if(encrypt)err=mbedtls_gcm_crypt_and_tag(&ctx,MBEDTLS_GCM_ENCRYPT,14,
   source+16,12,source,16,payload,payload,16,payload+14);
  else err=mbedtls_gcm_auth_decrypt(&ctx,14,source+16,12,source,16,
   source+42,16,source+28,payload);
 }
 mbedtls_gcm_free(&ctx);return err==0;
}
static bool zjUdpBind(const String& signedKey,const String& token,const IPAddress& peer){
 if(!zjUdpTaskHandle||signedKey.length()!=64||token.length()!=32)return false;
 const String derived=zjHmac(signedKey,"ZJUDP1|"+zjKitId+"|"+token);
 if(!zjHex(derived,64)||!zjHex(token,32))return false;
 uint8_t key[32],tag[8];zjUnhex(derived,key);
 zjUnhex(token.substring(0,16),tag);
 portENTER_CRITICAL(&zjUdpMux);
 ++zjUdpGeneration;
 memcpy(zjUdpKey,key,32);memcpy(zjUdpToken,tag,8);
 for(int i=0;i<4;i++)zjUdpOwner[i]=peer[i];
 zjUdpLastSeq=0;zjUdpLastRx=0;zjUdpBoundAt=millis();zjUdpReceived=zjUdpRejected=0;
 zjUdpHasPending=false;zjUdpRequestedArm=false;zjUdpActive=true;zjUdpConfigured=true;
 portEXIT_CRITICAL(&zjUdpMux);
 memset(key,0,sizeof(key));
 return true;
}
static void zjUdpInvalidate(bool clearConfiguration=true){
 portENTER_CRITICAL(&zjUdpMux);
 ++zjUdpGeneration;
 zjUdpActive=false;zjUdpHasPending=false;zjUdpRequestedArm=false;
 if(clearConfiguration)zjUdpConfigured=false;
 memset(zjUdpKey,0,sizeof(zjUdpKey));
 portEXIT_CRITICAL(&zjUdpMux);
}
static bool zjUdpEnabled(){
 portENTER_CRITICAL(&zjUdpMux);const bool active=zjUdpActive;portEXIT_CRITICAL(&zjUdpMux);
 return active;
}
static String zjUdpStatistics(){
 uint32_t recv,rej,seq,rx;bool active;
 portENTER_CRITICAL(&zjUdpMux);
 recv=zjUdpReceived;rej=zjUdpRejected;seq=zjUdpLastSeq;rx=zjUdpLastRx;active=zjUdpActive;
 portEXIT_CRITICAL(&zjUdpMux);
 return String("{\"protocol\":\"ZJUDP1\",\"port\":")+String(ZJ_UDP_PORT)+
  ",\"active\":"+(active?"true":"false")+",\"received\":"+String(recv)+
  ",\"rejected\":"+String(rej)+",\"lastSequence\":"+String(seq)+
  ",\"lastPacketAgeMs\":"+(rx?String(uint32_t(millis()-rx)):String("null"))+
  ",\"motorsDisabled\":true}";
}
static void zjUdpReceiverTask(void*){
 uint8_t packet[ZJ_UDP_SIZE+4],plain[14],key[32],token[8],owner[4];
 for(;;){
  const int n=zjUdpSocket.parsePacket();
  if(n<=0){vTaskDelay(pdMS_TO_TICKS(2));continue;}
  if(n!=int(ZJ_UDP_SIZE)){while(zjUdpSocket.available())zjUdpSocket.read();continue;}
  if(zjUdpSocket.read(packet,ZJ_UDP_SIZE)!=int(ZJ_UDP_SIZE))continue;
  const IPAddress source=zjUdpSocket.remoteIP();
  bool active;uint32_t previous,received,rejected,last,generation;bool priorArmed;
  portENTER_CRITICAL(&zjUdpMux);
  active=zjUdpActive&&uint32_t(millis()-zjUdpBoundAt)<1800000;memcpy(key,zjUdpKey,32);memcpy(token,zjUdpToken,8);
  memcpy(owner,zjUdpOwner,4);previous=zjUdpLastSeq;last=zjUdpLastRx;
  priorArmed=zjUdpRequestedArm;
  generation=zjUdpGeneration;
  portEXIT_CRITICAL(&zjUdpMux);
  bool address=true;for(int i=0;i<4;i++)if(owner[i]!=source[i])address=false;
  if(!active||!address||memcmp(packet,"ZJU1",4)||memcmp(packet+4,token,8))continue;
  const uint32_t seq=zjUdpGet32(packet+12),now=millis();
  if(!seq||(previous&&int32_t(seq-previous)<=0)||!zjUdpGcm(false,key,packet,plain)){
   portENTER_CRITICAL(&zjUdpMux);if(generation==zjUdpGeneration)++zjUdpRejected;portEXIT_CRITICAL(&zjUdpMux);continue;
  }
  uint16_t ch[6];bool valid=true;
  for(int i=0;i<6;i++){ch[i]=(uint16_t(plain[2*i])<<8)|plain[2*i+1];if(ch[i]<1000||ch[i]>2000)valid=false;}
  const bool armed=(plain[12]&1)!=0;
  if((plain[12]&~1)!=0||plain[13]!=0||(armed&&!priorArmed&&ch[0]>1050))valid=false;
  // Fail-closed: a late frame cannot resurrect an armed session, even if the
  // main Arduino loop was occupied with an unrelated HTTP response.
  if(priorArmed&&last&&uint32_t(now-last)>ZJ_RC_DEADMAN_MS)valid=false;
  portENTER_CRITICAL(&zjUdpMux);
  if(generation!=zjUdpGeneration){portEXIT_CRITICAL(&zjUdpMux);continue;}
  if(!valid){
   ++zjUdpRejected;zjUdpActive=false;zjUdpHasPending=false;portEXIT_CRITICAL(&zjUdpMux);continue;
  }
  if(!zjUdpActive||zjUdpLastSeq&&int32_t(seq-zjUdpLastSeq)<=0){
   ++zjUdpRejected;portEXIT_CRITICAL(&zjUdpMux);continue;
  }
  if(uint32_t(now-zjUdpBoundAt)>=1800000){zjUdpActive=false;portEXIT_CRITICAL(&zjUdpMux);continue;}
  zjUdpLastSeq=seq;zjUdpLastRx=now;zjUdpRequestedArm=armed;++zjUdpReceived;
  zjUdpPendingSeq=seq;zjUdpPendingAt=now;
  for(int i=0;i<6;i++)zjUdpPendingChannels[i]=ch[i];
  zjUdpPendingArmed=armed;zjUdpHasPending=true;
  received=zjUdpReceived;rejected=zjUdpRejected;
  portEXIT_CRITICAL(&zjUdpMux);
  // ACK means *authenticated frame received*, not motor or physics applied.
  // An independent receiver prevents HTTP response processing from pacing UDP.
  uint8_t ack[ZJ_UDP_SIZE]={},ackPlain[ZJ_UDP_SIZE]={};
  memcpy(ack,"ZJA1",4);memcpy(ack+4,token,8);zjUdpPut32(ack+12,seq);
  const uint32_t random=esp_random();zjUdpPut32(ack+16,random);
  zjUdpPut32(ack+20,seq);memcpy(ack+24,"KIT!",4);
  zjUdpPut32(ackPlain,seq);zjUdpPut32(ackPlain+4,received);
  zjUdpPut32(ackPlain+8,rejected);
  ackPlain[12]=0x05|(armed?0x02:0);ackPlain[13]=0;
  if(zjUdpGcm(true,key,ack,ackPlain)){
   memcpy(ack+28,ackPlain,30);
   zjUdpSocket.beginPacket(source,zjUdpSocket.remotePort());
   zjUdpSocket.write(ack,ZJ_UDP_SIZE);zjUdpSocket.endPacket();
  }
 }
}
static void zjUdpSetup(){
 if(zjUdpTaskHandle||!zjUdpSocket.begin(ZJ_UDP_PORT))return;
 if(xTaskCreate(zjUdpReceiverTask,"zj-udp-rc",6144,nullptr,2,&zjUdpTaskHandle)!=pdPASS){
  zjUdpSocket.stop();zjUdpTaskHandle=nullptr;
 }
}
// Main loop owns all String-valued RC state; worker publishes only fixed-size
// authenticated latest-frame data through a critical-section mailbox.
static void zjUdpLoop(uint32_t now){
 uint16_t ch[6];uint32_t seq=0,receivedAt=0;bool arm=false,active=false;
 portENTER_CRITICAL(&zjUdpMux);
 active=zjUdpActive;
 const bool configured=zjUdpConfigured;
 if(zjUdpHasPending){
  seq=zjUdpPendingSeq;receivedAt=zjUdpPendingAt;
  memcpy(ch,zjUdpPendingChannels,sizeof(ch));arm=zjUdpPendingArmed;
  zjUdpHasPending=false;
 }
 portEXIT_CRITICAL(&zjUdpMux);
 if(!active){if(configured&&zjRcOwned&&zjRcSource=="ANDROID"){zjRcRelease("UDP_INPUT_TIMEOUT");zjUdpInvalidate();}return;}
 if(!zjRcOwned||!zjRcNetwork||zjRcSource!="ANDROID"||zjRcTransport==nullptr){zjUdpInvalidate();return;}
 if(seq){
  if(uint32_t(now-receivedAt)>ZJ_RC_DEADMAN_MS){
   zjUdpInvalidate();zjRcRelease("UDP_STALE_FRAME");return;
  }
  // Latest datagram is authoritative; unused AUX values are validated on RX
  // but not mapped to ESC/PWM or physical motor arming.
  if(!zjRcFrame(seq,ch[0],ch[1],ch[2],ch[3],"ANDROID",zjRcSession,true,zjRcOwnerIP,arm)){
   // A 20ms duplicate boundary is safe to skip; every other rejection stops.
   if(zjRcOwned&&uint32_t(now-zjRcLast)>ZJ_RC_DEADMAN_MS){zjUdpInvalidate();zjRcRelease("UDP_FRAME_REJECTED");}
  }
 }
}
