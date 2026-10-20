#pragma once
// ZJUDP1 diagnostic input: 16B AAD + 12B nonce + 14B channels + 16B GCM tag.
// Claim-negotiated feedback v2 is 72B, with 28B encrypted body:
// RX seq/u32, applied seq/u32, receive age/u16, apply age/u16, received/u32,
// applied/u32, rejected/u32, flags/u8, kind/u8, reason/u8, reserved zero/u8.
// Kind 1=RX_ACK, 2=APPLIED_ACK, 3=NACK. Unknown age=65535. No motor outputs.
#include <WiFiUdp.h>
#include <mbedtls/gcm.h>
static constexpr uint16_t ZJ_UDP_PORT=4210;
static constexpr size_t ZJ_UDP_SIZE=58,ZJ_UDP_FEEDBACK_SIZE=72;
static constexpr uint32_t ZJ_UDP_APPLY_MS=20;
enum ZjUdpNack:uint8_t {ZJ_UDP_OK=0,ZJ_UDP_INVALID_FRAME=1,ZJ_UDP_STALE=2,
 ZJ_UDP_OWNER_CONFLICT=3,ZJ_UDP_APPLY_STALLED=4,ZJ_UDP_AUTH_EXPIRED=5};
static const char* zjUdpReason(uint8_t n){switch(n){
 case ZJ_UDP_INVALID_FRAME:return "INVALID_FRAME";case ZJ_UDP_STALE:return "STALE";
 case ZJ_UDP_OWNER_CONFLICT:return "OWNER_CONFLICT";case ZJ_UDP_APPLY_STALLED:return "APPLY_STALLED";
 case ZJ_UDP_AUTH_EXPIRED:return "AUTH_EXPIRED";default:return "NONE";}}
static WiFiUDP zjUdpSocket;
static TaskHandle_t zjUdpTaskHandle=nullptr;
static portMUX_TYPE zjUdpMux=portMUX_INITIALIZER_UNLOCKED;
static bool zjUdpActive=false,zjUdpConfigured=false,zjUdpHasPending=false,zjUdpRequestedArm=false;
static bool zjUdpAppliedArm=false,zjUdpTerminalReported=false;
static uint8_t zjUdpKey[32]={},zjUdpToken[8]={},zjUdpOwner[4]={},zjUdpFeedbackVersion=1;
static uint32_t zjUdpLastSeq=0,zjUdpLastRx=0,zjUdpFirstRx=0,zjUdpBoundAt=0,zjUdpReceived=0,zjUdpRejected=0;
static uint32_t zjUdpLastAppliedSeq=0,zjUdpLastAppliedAt=0,zjUdpAppliedCount=0,zjUdpNotifiedApplied=0;
static uint32_t zjUdpFeedbackCounter=0,zjUdpFeedbackSalt=0,zjUdpLastNackAt=0;
// The old Python controller sent 50 Hz with independent RX; retain encrypted feedback at bounded rate.
static constexpr uint32_t ZJ_UDP_APPLIED_FEEDBACK_MS=100;
static uint32_t zjUdpLastAppliedNoticeAt=0;
static bool zjUdpNotifiedArm=false;
static uint32_t zjUdpAckAttempted[4]={},zjUdpAckSent[4]={},zjUdpAckFailed[4]={};
static uint32_t zjUdpMaxTxUs=0,zjUdpMaxRxToAckUs=0;
static uint8_t zjUdpLastNack=0,zjUdpEndReason=0;
static uint16_t zjUdpOwnerPort=0;
static uint32_t zjUdpLifetime=0;
// These String references belong exclusively to the main loop.
static int zjUdpAuthSlot=-1;
static String zjUdpAuthId,zjUdpRcId;
static uint32_t zjUdpPendingSeq=0,zjUdpPendingAt=0,zjUdpGeneration=0;
static uint16_t zjUdpPendingChannels[6]={};
static bool zjUdpPendingArmed=false;
struct ZjUdpFeedback {uint8_t bytes[ZJ_UDP_FEEDBACK_SIZE]={},peer[4]={};uint16_t port=0;uint32_t generation=0;uint8_t kind=0;uint32_t rxAt=0;};
// Only the receiver writes sockets. Main queues ciphertext, never an auth key.
static ZjUdpFeedback zjUdpTerminal;
static bool zjUdpTerminalPending=false;
static uint32_t zjUdpGet32(const uint8_t* p){return (uint32_t(p[0])<<24)|(uint32_t(p[1])<<16)|(uint32_t(p[2])<<8)|p[3];}
static void zjUdpPut32(uint8_t* p,uint32_t n){p[0]=n>>24;p[1]=n>>16;p[2]=n>>8;p[3]=n;}
static void zjUdpPut16(uint8_t* p,uint16_t n){p[0]=n>>8;p[1]=n;}
static uint16_t zjUdpAge(uint32_t now,uint32_t at,bool known){if(!known)return 65535;const uint32_t age=now-at;return age>65534?65534:uint16_t(age);}
static bool zjUdpGcm(bool encrypt,const uint8_t key[32],const uint8_t* source,uint8_t* payload,size_t length=14){
 mbedtls_gcm_context ctx;mbedtls_gcm_init(&ctx);int err=mbedtls_gcm_setkey(&ctx,MBEDTLS_CIPHER_ID_AES,key,256);
 if(!err){if(encrypt)err=mbedtls_gcm_crypt_and_tag(&ctx,MBEDTLS_GCM_ENCRYPT,length,source+16,12,source,16,payload,payload,16,payload+length);
 else err=mbedtls_gcm_auth_decrypt(&ctx,length,source+16,12,source,16,source+28+length,16,source+28,payload);}
 mbedtls_gcm_free(&ctx);return err==0;
}
static bool zjUdpBind(const String& signedKey,const String& token,const IPAddress& peer,uint8_t feedbackVersion=1){
 if(!zjUdpTaskHandle||signedKey.length()!=64||token.length()!=32||feedbackVersion<1||feedbackVersion>2)return false;
 if(zjRequestSession<0||zjRequestSession>=8)return false;
 const auto& parent=zjSessions[zjRequestSession];const uint32_t now=millis(),age=uint32_t(now-parent.at);
 if(parent.id.isEmpty()||parent.key!=signedKey||parent.localSta||age>=1800000)return false;
 const String derived=zjHmac(signedKey,"ZJUDP1|"+zjKitId+"|"+token);
 if(!zjHex(derived,64)||!zjHex(token,32))return false;
 uint8_t key[32],tag[8];zjUnhex(derived,key);zjUnhex(token.substring(0,16),tag);
 zjUdpAuthSlot=zjRequestSession;zjUdpAuthId=parent.id;zjUdpRcId=token;
 portENTER_CRITICAL(&zjUdpMux);
 ++zjUdpGeneration;memcpy(zjUdpKey,key,32);memcpy(zjUdpToken,tag,8);
 for(int i=0;i<4;i++)zjUdpOwner[i]=peer[i];
 zjUdpLastSeq=zjUdpLastRx=zjUdpFirstRx=0;zjUdpBoundAt=now;zjUdpLifetime=1800000-age;
 zjUdpReceived=zjUdpRejected=zjUdpAppliedCount=zjUdpLastAppliedSeq=zjUdpLastAppliedAt=zjUdpNotifiedApplied=0;
 zjUdpFeedbackCounter=0;zjUdpFeedbackSalt=esp_random();zjUdpFeedbackVersion=feedbackVersion;zjUdpOwnerPort=0;
 zjUdpLastAppliedNoticeAt=0;zjUdpNotifiedArm=false;zjUdpMaxTxUs=zjUdpMaxRxToAckUs=0;
 for(int i=0;i<4;i++)zjUdpAckAttempted[i]=zjUdpAckSent[i]=zjUdpAckFailed[i]=0;
 zjUdpHasPending=zjUdpRequestedArm=zjUdpAppliedArm=zjUdpTerminalPending=zjUdpTerminalReported=false;
 zjUdpEndReason=zjUdpLastNack=0;zjUdpLastNackAt=0;zjUdpActive=zjUdpConfigured=true;
 portEXIT_CRITICAL(&zjUdpMux);memset(key,0,sizeof(key));zjRcUdpOwned=true;return true;
}
static void zjUdpInvalidate(bool clearConfiguration=true){
 portENTER_CRITICAL(&zjUdpMux);++zjUdpGeneration;
 zjUdpActive=zjUdpHasPending=zjUdpRequestedArm=zjUdpTerminalPending=false;
 if(clearConfiguration)zjUdpConfigured=false;
 memset(zjUdpKey,0,sizeof(zjUdpKey));portEXIT_CRITICAL(&zjUdpMux);
 zjUdpAuthSlot=-1;zjUdpAuthId="";zjUdpRcId="";zjRcUdpOwned=false;
}
static bool zjUdpEnabled(){portENTER_CRITICAL(&zjUdpMux);const bool active=zjUdpActive;portEXIT_CRITICAL(&zjUdpMux);return active;}
// Nonce counter is independent of input seq: RX/APPLIED/NACK may share a seq.
static bool zjUdpBuildFeedback(ZjUdpFeedback& out,uint8_t kind,uint32_t seq,uint8_t reason,bool terminal){
 uint8_t key[32],body[44]={};uint32_t rx,applied,rxAt,appliedAt,counter,salt,received,count,rejected;bool armed;
 portENTER_CRITICAL(&zjUdpMux);
 if(!zjUdpConfigured||zjUdpFeedbackVersion!=2||!zjUdpOwnerPort||zjUdpFeedbackCounter==0xffffffff){portEXIT_CRITICAL(&zjUdpMux);return false;}
 out.generation=zjUdpGeneration;out.port=zjUdpOwnerPort;out.kind=kind;memcpy(out.peer,zjUdpOwner,4);
 memcpy(key,zjUdpKey,32);memcpy(out.bytes+4,zjUdpToken,8);
 rx=zjUdpLastSeq;applied=zjUdpLastAppliedSeq;rxAt=zjUdpLastRx;appliedAt=zjUdpLastAppliedAt;out.rxAt=rxAt;
 received=zjUdpReceived;count=zjUdpAppliedCount;rejected=zjUdpRejected;armed=zjUdpAppliedArm;
 counter=++zjUdpFeedbackCounter;salt=zjUdpFeedbackSalt;portEXIT_CRITICAL(&zjUdpMux);
 const uint32_t now=millis();memcpy(out.bytes,"ZJA2",4);zjUdpPut32(out.bytes+12,seq);
 zjUdpPut32(out.bytes+16,salt);zjUdpPut32(out.bytes+20,counter);memcpy(out.bytes+24,"FBK2",4);
 zjUdpPut32(body,rx);zjUdpPut32(body+4,applied);
 zjUdpPut16(body+8,zjUdpAge(now,rxAt,rx!=0));zjUdpPut16(body+10,zjUdpAge(now,appliedAt,applied!=0));
 zjUdpPut32(body+12,received);zjUdpPut32(body+16,count);zjUdpPut32(body+20,rejected);
 body[24]=(rx?1:0)|(armed?2:0)|4|(applied?8:0)|(terminal?16:0);body[25]=kind;body[26]=reason;
 const bool ok=zjUdpGcm(true,key,out.bytes,body,28);if(ok)memcpy(out.bytes+28,body,44);
 memset(key,0,sizeof(key));return ok;
}
static bool zjUdpEmit(const ZjUdpFeedback& out){
 portENTER_CRITICAL(&zjUdpMux);const bool current=out.generation==zjUdpGeneration;portEXIT_CRITICAL(&zjUdpMux);
 if(!current||!out.port)return false;
 const uint32_t start=micros();
 const bool ok=zjUdpSocket.beginPacket(IPAddress(out.peer[0],out.peer[1],out.peer[2],out.peer[3]),out.port)!=0&&
  zjUdpSocket.write(out.bytes,ZJ_UDP_FEEDBACK_SIZE)==ZJ_UDP_FEEDBACK_SIZE&&zjUdpSocket.endPacket()!=0;
 const uint32_t elapsed=micros()-start;
 portENTER_CRITICAL(&zjUdpMux);
 if(out.kind>=1&&out.kind<=3){
  ++zjUdpAckAttempted[out.kind];
  if(ok)++zjUdpAckSent[out.kind];else ++zjUdpAckFailed[out.kind];
 }
 if(elapsed>zjUdpMaxTxUs)zjUdpMaxTxUs=elapsed;
 if(out.kind==1&&out.rxAt){
  // Receive time is captured in millis(): this is a coarse, bounded estimate.
  const uint32_t delay=micros()-out.rxAt*1000UL;
  if(delay>zjUdpMaxRxToAckUs&&delay<10000000UL)zjUdpMaxRxToAckUs=delay;
 }
 portEXIT_CRITICAL(&zjUdpMux);
 return ok;
}
static void zjUdpStop(uint8_t reason){
 bool report;uint32_t seq;
 portENTER_CRITICAL(&zjUdpMux);zjUdpActive=zjUdpHasPending=false;zjUdpEndReason=reason;zjUdpLastNack=reason;
 report=zjUdpConfigured&&!zjUdpTerminalReported;seq=zjUdpLastSeq;portEXIT_CRITICAL(&zjUdpMux);
 ZjUdpFeedback job;const bool ready=report&&zjUdpBuildFeedback(job,3,seq,reason,true);
 zjUdpInvalidate();
 if(ready){portENTER_CRITICAL(&zjUdpMux);job.generation=zjUdpGeneration;zjUdpTerminal=job;zjUdpTerminalPending=true;portEXIT_CRITICAL(&zjUdpMux);}
}
static uint8_t zjUdpCheckTimers(){
 uint8_t reason=0;portENTER_CRITICAL(&zjUdpMux);const uint32_t now=millis();
 if(zjUdpActive){
  if(uint32_t(now-zjUdpBoundAt)>=zjUdpLifetime)reason=ZJ_UDP_AUTH_EXPIRED;
  else if((zjUdpLastSeq&&uint32_t(now-zjUdpLastRx)>ZJ_RC_DEADMAN_MS)||(!zjUdpLastSeq&&uint32_t(now-zjUdpBoundAt)>ZJ_RC_LEASE_MS))reason=ZJ_UDP_STALE;
  else if((zjUdpRequestedArm||zjUdpAppliedArm)&&zjUdpLastSeq&&uint32_t(now-(zjUdpLastAppliedSeq?zjUdpLastAppliedAt:zjUdpFirstRx))>ZJ_RC_DEADMAN_MS)reason=ZJ_UDP_APPLY_STALLED;
  if(reason){zjUdpActive=zjUdpHasPending=false;zjUdpEndReason=zjUdpLastNack=reason;}
 }
 portEXIT_CRITICAL(&zjUdpMux);return reason;
}
static void zjUdpFlushFeedback(){
 ZjUdpFeedback terminal;bool queued=false;uint32_t applied=0,rx=0;bool appliedArm=false;
 portENTER_CRITICAL(&zjUdpMux);
 if(zjUdpTerminalPending){terminal=zjUdpTerminal;zjUdpTerminalPending=false;queued=true;}
 if(zjUdpActive&&zjUdpFeedbackVersion==2&&zjUdpLastAppliedSeq!=zjUdpNotifiedApplied&&
  (!zjUdpNotifiedApplied||zjUdpAppliedArm!=zjUdpNotifiedArm||uint32_t(millis()-zjUdpLastAppliedNoticeAt)>=ZJ_UDP_APPLIED_FEEDBACK_MS)){
  applied=zjUdpLastAppliedSeq;appliedArm=zjUdpAppliedArm;
 }
 rx=zjUdpLastSeq;portEXIT_CRITICAL(&zjUdpMux);
 if(queued)zjUdpEmit(terminal);
 const uint8_t timeout=zjUdpCheckTimers();
 if(timeout){ZjUdpFeedback job;if(zjUdpBuildFeedback(job,3,rx,timeout,true)&&zjUdpEmit(job)){
  portENTER_CRITICAL(&zjUdpMux);if(job.generation==zjUdpGeneration)zjUdpTerminalReported=true;portEXIT_CRITICAL(&zjUdpMux);
 }return;}
 if(applied){ZjUdpFeedback job;if(zjUdpBuildFeedback(job,2,applied,0,false)&&zjUdpEmit(job)){
  portENTER_CRITICAL(&zjUdpMux);if(job.generation==zjUdpGeneration){zjUdpNotifiedApplied=applied;zjUdpNotifiedArm=appliedArm;zjUdpLastAppliedNoticeAt=millis();}portEXIT_CRITICAL(&zjUdpMux);
 }}
}
static String zjUdpStatistics(){
 uint32_t recv,rej,seq,rx,applied,at,count;uint8_t version,nack;bool active;
 uint32_t rxSent,rxFailed,appliedSent,appliedFailed,nackSent,nackFailed,maxTxUs,maxRxToAckUs;
 portENTER_CRITICAL(&zjUdpMux);
 recv=zjUdpReceived;rej=zjUdpRejected;seq=zjUdpLastSeq;rx=zjUdpLastRx;active=zjUdpActive;
 applied=zjUdpLastAppliedSeq;at=zjUdpLastAppliedAt;count=zjUdpAppliedCount;version=zjUdpFeedbackVersion;nack=zjUdpLastNack;
 rxSent=zjUdpAckSent[1];rxFailed=zjUdpAckFailed[1];appliedSent=zjUdpAckSent[2];appliedFailed=zjUdpAckFailed[2];
 nackSent=zjUdpAckSent[3];nackFailed=zjUdpAckFailed[3];maxTxUs=zjUdpMaxTxUs;maxRxToAckUs=zjUdpMaxRxToAckUs;
 portEXIT_CRITICAL(&zjUdpMux);const uint32_t now=millis();
 return String("{\"protocol\":\"ZJUDP1\",\"port\":")+String(ZJ_UDP_PORT)+",\"feedbackVersion\":"+String(version)+
  ",\"active\":"+(active?"true":"false")+",\"received\":"+String(recv)+",\"applied\":"+String(count)+
  ",\"rejected\":"+String(rej)+",\"lastSequence\":"+String(seq)+",\"lastRxSeq\":"+String(seq)+
  ",\"lastAppliedSeq\":"+String(applied)+",\"lastPacketAgeMs\":"+(seq?String(uint32_t(now-rx)):String("null"))+
  ",\"receiveAgeMs\":"+(seq?String(uint32_t(now-rx)):String("null"))+
  ",\"applyAgeMs\":"+(applied?String(uint32_t(now-at)):String("null"))+
  ",\"rxAckSent\":"+String(rxSent)+",\"rxAckFailed\":"+String(rxFailed)+
  ",\"appliedAckSent\":"+String(appliedSent)+",\"appliedAckFailed\":"+String(appliedFailed)+
  ",\"nackSent\":"+String(nackSent)+",\"nackFailed\":"+String(nackFailed)+
  ",\"maxAckTxUs\":"+String(maxTxUs)+",\"maxRxToAckUs\":"+String(maxRxToAckUs)+
  ",\"nackReason\":\""+String(zjUdpReason(nack))+"\",\"motorsDisabled\":true}";
}
static void zjUdpReceiverTask(void*){
 uint8_t packet[ZJ_UDP_SIZE+4],plain[14],key[32],token[8],owner[4];
 for(;;){
  zjUdpFlushFeedback();const int n=zjUdpSocket.parsePacket();
  if(n<=0){vTaskDelay(pdMS_TO_TICKS(2));continue;}
  if(n!=int(ZJ_UDP_SIZE)){while(zjUdpSocket.available())zjUdpSocket.read();continue;}
  if(zjUdpSocket.read(packet,ZJ_UDP_SIZE)!=int(ZJ_UDP_SIZE))continue;
  const IPAddress source=zjUdpSocket.remoteIP();bool active,appliedArm;uint32_t generation;uint8_t version;
  portENTER_CRITICAL(&zjUdpMux);
  active=zjUdpActive;memcpy(key,zjUdpKey,32);memcpy(token,zjUdpToken,8);memcpy(owner,zjUdpOwner,4);
  generation=zjUdpGeneration;version=zjUdpFeedbackVersion;appliedArm=zjUdpAppliedArm;portEXIT_CRITICAL(&zjUdpMux);
  bool address=true;for(int i=0;i<4;i++)if(owner[i]!=source[i])address=false;
  if(!active||!address||memcmp(packet,"ZJU1",4)||memcmp(packet+4,token,8))continue;
  const uint32_t seq=zjUdpGet32(packet+12);
  if(!zjUdpGcm(false,key,packet,plain)){
   portENTER_CRITICAL(&zjUdpMux);if(generation==zjUdpGeneration)++zjUdpRejected;portEXIT_CRITICAL(&zjUdpMux);continue;
  }
  uint16_t ch[6];bool valid=true;
  for(int i=0;i<6;i++){ch[i]=(uint16_t(plain[2*i])<<8)|plain[2*i+1];if(ch[i]<1000||ch[i]>2000)valid=false;}
  const bool armed=(plain[12]&1)!=0;
  if((plain[12]&~1)!=0||plain[13]!=0||(armed&&!appliedArm&&ch[0]>1050))valid=false;
  const uint32_t now=millis();uint8_t reason=0;bool terminal=false,notify=true;uint32_t received=0,rejected=0;
  portENTER_CRITICAL(&zjUdpMux);
  if(generation!=zjUdpGeneration||!zjUdpActive){portEXIT_CRITICAL(&zjUdpMux);continue;}
  if(!seq){reason=ZJ_UDP_INVALID_FRAME;terminal=true;}
  else if(zjUdpLastSeq&&int32_t(seq-zjUdpLastSeq)<=0)reason=ZJ_UDP_STALE;
  else if(!valid){reason=ZJ_UDP_INVALID_FRAME;terminal=true;}
  else if(uint32_t(now-zjUdpBoundAt)>=zjUdpLifetime){reason=ZJ_UDP_AUTH_EXPIRED;terminal=true;}
  else if(zjUdpLastSeq&&uint32_t(now-zjUdpLastRx)>ZJ_RC_DEADMAN_MS){reason=ZJ_UDP_STALE;terminal=true;}
  if(reason){
   ++zjUdpRejected;notify=terminal||reason!=zjUdpLastNack||uint32_t(now-zjUdpLastNackAt)>=20;
   zjUdpLastNack=reason;if(notify)zjUdpLastNackAt=now;
   if(terminal){zjUdpActive=zjUdpHasPending=false;zjUdpEndReason=reason;}
  }else{
   if(!zjUdpLastSeq)zjUdpFirstRx=now;
   zjUdpLastSeq=seq;zjUdpLastRx=now;zjUdpRequestedArm=armed;++zjUdpReceived;
   zjUdpPendingSeq=seq;zjUdpPendingAt=now;
   for(int i=0;i<6;i++)zjUdpPendingChannels[i]=ch[i];
   zjUdpPendingArmed=armed;zjUdpHasPending=true;
  }
  zjUdpOwnerPort=zjUdpSocket.remotePort();received=zjUdpReceived;rejected=zjUdpRejected;portEXIT_CRITICAL(&zjUdpMux);
  if(version==2){ZjUdpFeedback job;
   if(notify&&zjUdpBuildFeedback(job,reason?3:1,seq,reason,terminal)&&zjUdpEmit(job)&&terminal){
    portENTER_CRITICAL(&zjUdpMux);if(job.generation==zjUdpGeneration)zjUdpTerminalReported=true;portEXIT_CRITICAL(&zjUdpMux);
   }
  }else if(!reason){uint8_t ack[ZJ_UDP_SIZE]={},body[30]={};
   memcpy(ack,"ZJA1",4);memcpy(ack+4,token,8);zjUdpPut32(ack+12,seq);
   zjUdpPut32(ack+16,esp_random());zjUdpPut32(ack+20,seq);memcpy(ack+24,"KIT!",4);
   zjUdpPut32(body,seq);zjUdpPut32(body+4,received);zjUdpPut32(body+8,rejected);body[12]=0x05|(armed?0x02:0);
   if(zjUdpGcm(true,key,ack,body)){
    memcpy(ack+28,body,30);portENTER_CRITICAL(&zjUdpMux);const bool current=generation==zjUdpGeneration;portEXIT_CRITICAL(&zjUdpMux);
    if(current){zjUdpSocket.beginPacket(source,zjUdpSocket.remotePort());zjUdpSocket.write(ack,ZJ_UDP_SIZE);zjUdpSocket.endPacket();}
   }
  }
 }
}
static void zjUdpSetup(){
 if(zjUdpTaskHandle||!zjUdpSocket.begin(ZJ_UDP_PORT))return;
 if(xTaskCreate(zjUdpReceiverTask,"zj-udp-rc",6144,nullptr,2,&zjUdpTaskHandle)!=pdPASS){zjUdpSocket.stop();zjUdpTaskHandle=nullptr;}
}
static const char* zjUdpReleaseReason(uint8_t reason){switch(reason){
 case ZJ_UDP_AUTH_EXPIRED:return "UDP_AUTH_EXPIRED";case ZJ_UDP_OWNER_CONFLICT:return "UDP_OWNER_CONFLICT";
 case ZJ_UDP_APPLY_STALLED:return "UDP_APPLY_TIMEOUT";case ZJ_UDP_INVALID_FRAME:return "UDP_FRAME_REJECTED";default:return "UDP_INPUT_TIMEOUT";}}
static void zjUdpLoop(uint32_t now){
 zjUdpCheckTimers();bool configured,active;uint8_t endReason;uint32_t appliedAt,appliedSeq;
 portENTER_CRITICAL(&zjUdpMux);configured=zjUdpConfigured;active=zjUdpActive;endReason=zjUdpEndReason;
 appliedAt=zjUdpLastAppliedAt;appliedSeq=zjUdpLastAppliedSeq;portEXIT_CRITICAL(&zjUdpMux);now=millis();
 if(!configured)return;
 if(zjUdpAuthSlot<0||zjUdpAuthSlot>=8||zjSessions[zjUdpAuthSlot].id!=zjUdpAuthId||uint32_t(now-zjSessions[zjUdpAuthSlot].at)>=1800000){
  const bool owns=zjRcOwned&&zjRcSource=="ANDROID"&&zjRcSession==zjUdpRcId;
  zjUdpStop(ZJ_UDP_AUTH_EXPIRED);if(owns)zjRcRelease("UDP_AUTH_EXPIRED");return;
 }
 if(!zjRcOwned||!zjRcNetwork||zjRcSource!="ANDROID"||zjRcSession!=zjUdpRcId){zjUdpStop(ZJ_UDP_OWNER_CONFLICT);return;}
 if(!active){zjUdpStop(endReason);zjRcRelease(zjUdpReleaseReason(endReason));return;}
 uint16_t ch[6];uint32_t seq=0,receivedAt=0,generation=0;bool arm=false;
 portENTER_CRITICAL(&zjUdpMux);
 // A newer authenticated frame replaces pending input. Early input is not invalid.
 if(zjUdpHasPending&&(!appliedSeq||uint32_t(now-appliedAt)>=ZJ_UDP_APPLY_MS||(!zjUdpPendingArmed&&zjRcInputArmed))){
  seq=zjUdpPendingSeq;receivedAt=zjUdpPendingAt;memcpy(ch,zjUdpPendingChannels,sizeof(ch));
  arm=zjUdpPendingArmed;generation=zjUdpGeneration;zjUdpHasPending=false;
 }
 portEXIT_CRITICAL(&zjUdpMux);now=millis();if(!seq)return;
 if(uint32_t(now-receivedAt)>ZJ_RC_DEADMAN_MS){zjUdpStop(ZJ_UDP_STALE);zjRcRelease("UDP_STALE_FRAME");return;}
 if(!zjRcFrame(seq,ch[0],ch[1],ch[2],ch[3],"ANDROID",zjRcSession,true,zjRcOwnerIP,arm)){
  zjUdpStop(ZJ_UDP_INVALID_FRAME);zjRcRelease("UDP_FRAME_REJECTED");return;
 }
 portENTER_CRITICAL(&zjUdpMux);const bool current=generation==zjUdpGeneration&&zjUdpActive;
 if(current){zjUdpLastAppliedSeq=seq;zjUdpLastAppliedAt=millis();zjUdpAppliedArm=zjRcInputArmed;++zjUdpAppliedCount;}
 const uint8_t stopped=zjUdpEndReason;portEXIT_CRITICAL(&zjUdpMux);
 if(!current){zjUdpStop(stopped);zjRcRelease(zjUdpReleaseReason(stopped));}
}
