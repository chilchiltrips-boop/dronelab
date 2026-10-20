// Execute the actual RC UDP receiver and AES-GCM using POSIX radio/RTOS doubles.
#define main enrollmentHeaderTests
#include "firmware-host.cpp"
#undef main
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
using TaskHandle_t=void*;using portMUX_TYPE=int;
#define portMUX_INITIALIZER_UNLOCKED 0
#define pdPASS 1
#define pdMS_TO_TICKS(x) (x)
static std::function<void()> criticalHook;
static void portENTER_CRITICAL(portMUX_TYPE*){auto hook=criticalHook;if(hook)hook();}
static void portEXIT_CRITICAL(portMUX_TYPE*){}
struct Idle{};static void vTaskDelay(int){throw Idle{};}
static int xTaskCreate(void(*)(void*),const char*,int,void*,int,TaskHandle_t* task){*task=reinterpret_cast<void*>(1);return pdPASS;}
#define ZJ_UDP_HOST_IMMEDIATE_APPLIED_ACK // Synchronous legacy v2 fixture
// ZJ_UDP_RX_FEEDBACK_MS uses the same host fixture flag; production is 50ms.
#include "../FlightCore_Firmware/FlightCoreUdp.h"

static int peerSocket;
static uint8_t testGrantKey[32];
static uint32_t testFeedbackCounter=0;
static void newGrant(uint8_t version=1){
 zjUdpInvalidate();zjRcRelease("NETWORK_RELEASE");clockMs+=20;
 auto& auth=zjSessions[7];auth=ZjSession();auth.id=String(std::string(32,'b'));
 auth.key=String(std::string(64,'a'));auth.at=clockMs;zjRequestSession=7;
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(192,168,4,2),"AP"));
 assert(zjUdpBind(String(std::string(64,'a')),zjRcSession,IPAddress(192,168,4,2),version));
 memcpy(testGrantKey,zjUdpKey,32);testFeedbackCounter=0;
}
static std::vector<uint8_t> frame(uint32_t seq,bool arm,int throttle=1000,int roll=1500){
 std::vector<uint8_t> packet(58);memcpy(packet.data(),"ZJU1",4);memcpy(packet.data()+4,zjUdpToken,8);zjUdpPut32(packet.data()+12,seq);zjUdpPut32(packet.data()+20,seq);memcpy(packet.data()+24,"ANDR",4);
 uint8_t body[30]={};const int channels[6]={throttle,roll,1500,1500,1000,1000};
 for(int i=0;i<6;i++){body[2*i]=channels[i]>>8;body[2*i+1]=channels[i];}body[12]=arm?1:0;
 assert(zjUdpGcm(true,zjUdpKey,packet.data(),body));memcpy(packet.data()+28,body,30);return packet;
}
static void deliver(const std::vector<uint8_t>& packet){
 sockaddr_in addr{};addr.sin_family=AF_INET;addr.sin_addr.s_addr=htonl(INADDR_LOOPBACK);addr.sin_port=htons(testRpcPort);
 assert(sendto(peerSocket,packet.data(),packet.size(),0,(sockaddr*)&addr,sizeof(addr))==58);
 try{zjUdpReceiverTask(nullptr);}catch(const Idle&){}
}
static void expectAck(bool expected){
 uint8_t packet[58];const int n=recv(peerSocket,packet,sizeof(packet),0);
 assert(expected?n==58:n<0);
 if(expected){uint8_t plain[14];assert(zjUdpGcm(false,zjUdpKey,packet,plain));assert((plain[12]&7)==7);}
}
static void replaceAtNextCommit(){
 int* calls=new int(0);
 // Flush snapshot + timer + grant snapshot precede the post-decryption commit.
 criticalHook=[calls](){if(++*calls==4){criticalHook=nullptr;newGrant();delete calls;}};
}
static void pump(){try{zjUdpReceiverTask(nullptr);}catch(const Idle&) {}}
static std::vector<uint8_t> feedback(uint8_t kind,uint8_t reason=0,bool terminal=false){
 uint8_t packet[73],plain[28];int n=recv(peerSocket,packet,sizeof(packet),0);
 assert(n==72&&!memcmp(packet,"ZJA2",4));assert(zjUdpGcm(false,testGrantKey,packet,plain,28));
 const uint32_t counter=zjUdpGet32(packet+20);assert(counter>testFeedbackCounter);testFeedbackCounter=counter;
 assert(plain[25]==kind&&plain[26]==reason&&bool(plain[24]&16)==terminal&&plain[27]==0);
 return std::vector<uint8_t>(plain,plain+28);
}
static void feedbackTests(){
 newGrant(2);deliver(frame(1,true));auto rx=feedback(1);
 assert(zjUdpGet32(rx.data())==1&&zjUdpGet32(rx.data()+4)==0&&!(rx[24]&2));
 zjUdpLoop(clockMs);pump();auto applied=feedback(2);
 assert(zjUdpGet32(applied.data()+4)==1&&(applied[24]&10)==10);
 const uint32_t rejected=zjRcRejected;
 clockMs+=19;deliver(frame(2,true,1000,1600));feedback(1);zjUdpLoop(clockMs);
 assert(zjUdpHasPending&&zjRcSeq==1&&zjRcRejected==rejected);
 deliver(frame(3,true,1000,1800));feedback(1);zjUdpLoop(clockMs);assert(zjRcSeq==1);
 clockMs++;zjUdpLoop(clockMs);pump();applied=feedback(2);
 assert(zjRcSeq==3&&zjRcRoll==1800&&zjUdpAppliedCount==2&&zjRcRejected==rejected);
 assert(((applied[8]<<8)|applied[9])==1&&((applied[10]<<8)|applied[11])==0);
 const uint32_t lastRx=zjUdpLastRx;
 auto bad=frame(4,true);bad[57]^=1;clockMs+=2;deliver(bad);expectAck(false);
 assert(zjUdpLastRx==lastRx&&zjUdpLastSeq==3);
 deliver(frame(2,true));feedback(3,ZJ_UDP_STALE);assert(zjUdpActive&&zjUdpLastRx==lastRx);
 clockMs+=20;deliver(frame(4,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 deliver(frame(5,true,2500));feedback(3,ZJ_UDP_INVALID_FRAME,true);zjUdpLoop(clockMs);
 assert(!zjRcOwned&&!zjRcInputArmed);
 // An old armed/high-throttle frame after a successful DISARM is stale,
 // rather than an invalid attempt to re-arm. It cannot change the mailbox.
 newGrant(2);deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 clockMs+=20;auto oldArmed=frame(2,true,1400);deliver(oldArmed);feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 deliver(frame(3,false));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);assert(!zjRcInputArmed);
 const auto disarmedRx=zjUdpLastRx;clockMs+=2;deliver(oldArmed);feedback(3,ZJ_UDP_STALE);
 assert(zjUdpActive&&!zjUdpHasPending&&zjUdpLastRx==disarmedRx&&!zjRcInputArmed);
 // A slow claim handshake cannot consume the first armed apply deadline.
 newGrant(2);clockMs+=1200;deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 assert(zjRcOwned&&zjRcInputArmed);
 // Invalid packets and NACK traffic cannot renew the receive watchdog.
 newGrant(2);deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 clockMs+=501;pump();auto timeout=feedback(3,ZJ_UDP_STALE,true);
 assert(((timeout[8]<<8)|timeout[9])==501);zjUdpLoop(clockMs);assert(!zjRcOwned);
 // Fresh RX acknowledgements cannot mask an apply loop that stopped progressing.
 newGrant(2);deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 for(int i=2;i<=6;i++){clockMs+=110;deliver(frame(i,true));feedback(1);}
 clockMs++;pump();feedback(3,ZJ_UDP_APPLY_STALLED,true);zjUdpLoop(clockMs);
 assert(!zjRcOwned&&zjRcLastReleaseReason=="UDP_APPLY_TIMEOUT");
 // A different owner remains intact; only the old grant gets the terminal NACK.
 newGrant(2);deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 zjRcRelease("USB_STOP");assert(zjRcClaim("WEB",zjKitCode,false,IPAddress(),"USB"));
 zjUdpLoop(clockMs);pump();feedback(3,ZJ_UDP_OWNER_CONFLICT,true);
 assert(zjRcOwned&&zjRcSource=="WEB"&&!zjRcInputArmed);zjRcRelease("USB_STOP");
 newGrant(2);deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 zjSessions[7]=ZjSession();zjUdpLoop(clockMs);pump();feedback(3,ZJ_UDP_AUTH_EXPIRED,true);
 assert(!zjRcOwned&&!zjUdpEnabled());
 // New claims discard queued old-session terminal notices.
 newGrant(2);deliver(frame(1,true));feedback(1);zjUdpLoop(clockMs);pump();feedback(2);
 zjRcRelease("USB_STOP");zjUdpLoop(clockMs);newGrant(2);pump();expectAck(false);
}
int main(){
 zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";clockMs=1000;zjUdpSetup();assert(zjUdpTaskHandle);
 peerSocket=socket(AF_INET,SOCK_DGRAM,0);timeval timeout{0,30000};setsockopt(peerSocket,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));
 newGrant();deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);assert(zjRcInputArmed&&zjRcSeq==1);
 // The receiver can publish one millisecond after NetworkLoop captured now.
 // This fresh packet must not underflow an unsigned packet-age subtraction.
 newGrant();clockMs+=20;deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs-1);
 assert(zjRcOwned&&zjRcInputArmed&&zjRcSeq==1);
 // An old authenticated frame must not publish into a new claim while crypto
 // ran outside the receiver's critical section, or invalidate that claim.
 auto old=frame(2,true);replaceAtNextCommit();deliver(old);expectAck(false);
 assert(zjUdpActive&&zjUdpLastSeq==0&&!zjUdpHasPending&&zjUdpRejected==0);
 old=frame(1,true,1500);replaceAtNextCommit();deliver(old);expectAck(false);
 assert(zjUdpActive&&zjUdpLastSeq==0&&!zjUdpHasPending&&zjUdpRejected==0);
 old=frame(1,true);old[57]^=1;replaceAtNextCommit();deliver(old);expectAck(false);
 assert(zjUdpActive&&zjUdpRejected==0);
 deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);assert(zjRcInputArmed);
 clockMs+=501;deliver(frame(2,true));expectAck(false);zjUdpLoop(clockMs);
 assert(!zjRcOwned&&!zjRcInputArmed&&zjRcThrottle==1000);
 // Closing the parent authentication session revokes its UDP grant immediately.
 newGrant();deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);
 zjSessions[7]=ZjSession();zjUdpLoop(clockMs);
 assert(!zjUdpActive&&!zjRcOwned&&!zjRcInputArmed);
 newGrant();deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);
 zjSessions[7].id=String(std::string(32,'c'));zjUdpLoop(clockMs);
 assert(!zjUdpActive&&!zjRcOwned&&!zjRcInputArmed);
 // A claim near authentication expiry must inherit only the remaining time.
 newGrant();zjUdpInvalidate();zjSessions[7].at=clockMs-1799950;
 assert(zjUdpBind(zjSessions[7].key,zjRcSession,IPAddress(192,168,4,2)));
 deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);
 clockMs+=51;deliver(frame(2,true));expectAck(false);zjUdpLoop(clockMs);
 assert(!zjUdpActive&&!zjRcOwned&&!zjRcInputArmed);
 feedbackTests();close(peerSocket);zjUdpSocket.stop();
 std::cout<<"PASS actual UDP RC receiver: encrypted ARM, ACK, grant race rejection, parent close/replacement/expiry, watchdog"<<std::endl;
}
