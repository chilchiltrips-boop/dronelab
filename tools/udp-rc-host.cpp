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
#include "../FlightCore_Firmware/FlightCoreUdp.h"

static int peerSocket;
static void newGrant(){
 zjUdpInvalidate();zjRcRelease("NETWORK_RELEASE");clockMs+=20;
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(192,168,4,2),"AP"));
 assert(zjUdpBind(String(std::string(64,'a')),zjRcSession,IPAddress(192,168,4,2)));
}
static std::vector<uint8_t> frame(uint32_t seq,bool arm,int throttle=1000){
 std::vector<uint8_t> packet(58);memcpy(packet.data(),"ZJU1",4);memcpy(packet.data()+4,zjUdpToken,8);zjUdpPut32(packet.data()+12,seq);zjUdpPut32(packet.data()+20,seq);memcpy(packet.data()+24,"ANDR",4);
 uint8_t body[30]={};const int channels[6]={throttle,1500,1500,1500,1000,1000};
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
 criticalHook=[calls](){if(++*calls==2){criticalHook=nullptr;newGrant();delete calls;}};
}
int main(){
 zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";clockMs=1000;zjUdpSetup();assert(zjUdpTaskHandle);
 peerSocket=socket(AF_INET,SOCK_DGRAM,0);timeval timeout{0,30000};setsockopt(peerSocket,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));
 newGrant();deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);assert(zjRcInputArmed&&zjRcSeq==1);
 // An old authenticated frame must not publish into a new claim while crypto
 // ran outside the receiver's critical section, or invalidate that claim.
 auto old=frame(2,true);replaceAtNextCommit();deliver(old);expectAck(false);
 assert(zjUdpActive&&zjUdpLastSeq==0&&!zjUdpHasPending&&zjUdpRejected==0);
 old=frame(1,true,1500);replaceAtNextCommit();deliver(old);expectAck(false);
 assert(zjUdpActive&&zjUdpLastSeq==0&&!zjUdpHasPending&&zjUdpRejected==0);
 old=frame(1,true);old[57]^=1;replaceAtNextCommit();deliver(old);expectAck(false);
 assert(zjUdpActive&&zjUdpRejected==0);
 deliver(frame(1,true));expectAck(true);zjUdpLoop(clockMs);assert(zjRcInputArmed);
 clockMs+=351;deliver(frame(2,true));expectAck(false);zjUdpLoop(clockMs);
 assert(!zjRcOwned&&!zjRcInputArmed&&zjRcThrottle==1000);
 close(peerSocket);zjUdpSocket.stop();
 std::cout<<"PASS actual UDP RC receiver: encrypted ARM, ACK, grant race rejection, watchdog"<<std::endl;
}
