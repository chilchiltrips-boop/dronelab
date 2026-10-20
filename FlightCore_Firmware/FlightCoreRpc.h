#pragma once
// ZJM1 management datagrams share the EXACT scoped handlers, AES-GCM POST
// envelope and signed response proofs with the browser compatibility server.
// No HTTP is placed on the wire. RC keeps its separate 4210 receiver/task.
#include <WiFiUdp.h>
#include <functional>
#include <algorithm>
#include <memory>
#include <new>
#include <mbedtls/sha256.h>
#include "FlightCoreHttpBudget.h"
#ifdef ARDUINO
#include <lwip/sockets.h>
#endif

class ZjNetworkServer : public WebServer {
 struct Route {String path;HTTPMethod verb;std::function<void()> run;};
 Route routes[40];size_t routeCount=0;
 bool rpc=false;HTTPMethod rpcMethod=HTTP_GET;String rpcPath,rpcForm,rpcHeaders[4];
 IPAddress rpcPeer;int rpcStatus=500;String rpcBody,rpcProof;
#ifdef ARDUINO
 std::unique_ptr<char[]> httpBuffer{new(std::nothrow) char[ZJ_HTTP_RESPONSE_MAX]};
 NetworkClient responseClient;size_t responseSize=0,responseSent=0;
 uint32_t requestAt=0,responseAt=0;bool queueHttp=false,httpOverflow=false;
 size_t _currentClientWrite(const char* bytes,size_t size)override{
  if(!queueHttp)return WebServer::_currentClientWrite(bytes,size);
  if(!httpBuffer||responseSize+size>ZJ_HTTP_RESPONSE_MAX){httpOverflow=true;return 0;}
  responseClient=_currentClient;memcpy(httpBuffer.get()+responseSize,bytes,size);responseSize+=size;return size;
 }
 size_t _currentClientWrite_P(PGM_P bytes,size_t size)override{return _currentClientWrite(bytes,size);}
#endif
 static String decode(const String& in){
  String out;for(size_t i=0;i<in.length();i++){
   if(in[i]=='+')out+=' ';
   else if(in[i]=='%'&&i+2<in.length()&&isxdigit(in[i+1])&&isxdigit(in[i+2])){
    out+=char(strtoul(in.substring(i+1,i+3).c_str(),nullptr,16));i+=2;
   }else out+=in[i];
  }return out;
 }
 public:
 bool (*controlActive)()=nullptr;bool (*admit)()=nullptr;
 uint32_t httpDeferred=0,httpDropped=0,httpMaxDurationMs=0;
 explicit ZjNetworkServer(int port):WebServer(port){}
 #ifdef ARDUINO
 void handleClient()override{
  // TCP send() is nonblocking and each iteration emits at most 1024 bytes.
  // Keep a socket reference after WebServer finishes its request callback.
  if(responseSize){
   if(httpOverflow||uint32_t(millis()-responseAt)>ZJ_HTTP_PEER_MS){responseClient.stop();++httpDropped;responseSize=responseSent=0;return;}
   const int n=::send(responseClient.fd(),httpBuffer.get()+responseSent,std::min(ZJ_HTTP_SEND_CHUNK,responseSize-responseSent),MSG_DONTWAIT);
   if(n>0)responseSent+=size_t(n);
   if(responseSent==responseSize){responseClient.stop();responseSize=responseSent=0;}
   return;
  }
  if(!controlActive||!controlActive()){WebServer::handleClient();return;}
  if(!httpBuffer){++httpDropped;return;}
  if(!_currentClient){_currentClient=_server.accept();if(!_currentClient)return;
   requestAt=millis();_currentStatus=HC_WAIT_READ;_statusChange=requestAt;}
  const int n=::recv(_currentClient.fd(),httpBuffer.get(),ZJ_HTTP_REQUEST_MAX,MSG_PEEK|MSG_DONTWAIT);
  const int length=n>0?zjHttpRequestLength(httpBuffer.get(),size_t(n)):0;
  if(length<0||n==0||uint32_t(millis()-requestAt)>ZJ_HTTP_PEER_MS){_currentClient.stop();_currentStatus=HC_NONE;++httpDropped;return;}
  if(!length||n<length){++httpDeferred;return;}
  // All headers/body are present; parser cannot wait for a trickling peer.
  queueHttp=true;httpOverflow=false;responseSize=responseSent=0;responseAt=millis();
  WebServer::handleClient();queueHttp=false;
  const uint32_t duration=millis()-responseAt;if(duration>httpMaxDurationMs)httpMaxDurationMs=duration;
  if(httpOverflow){responseClient.stop();responseSize=responseSent=0;++httpDropped;}
 }
 #endif
 void on(const char* path,HTTPMethod verb,std::function<void()> run){
  const auto guarded=[this,run](){if(!admit||admit())run();};
  WebServer::on(path,verb,guarded);
  if(routeCount<40&&String(path).startsWith("/api/"))routes[routeCount++]={String(path),verb,guarded};
 }
 void on(const char* path,HTTPMethod verb,std::function<void()> run,std::function<void()> upload){
  // Retired multipart OTA is deliberately HTTP-only and always returns 410.
  WebServer::on(path,verb,[this,run](){if(!admit||admit())run();},upload);
 }
 bool isRpc()const{return rpc;}
 IPAddress peerIP(){return rpc?rpcPeer:WebServer::client().remoteIP();}
 IPAddress localIP(){return rpc?(WiFi.status()==WL_CONNECTED?WiFi.localIP():WiFi.softAPIP()):WebServer::client().localIP();}
 // Keep the existing auth/ownership checks transport-independent.
 String uri(){return rpc?rpcPath:WebServer::uri();}
 HTTPMethod method(){return rpc?rpcMethod:WebServer::method();}
 String arg(const String& name){
  if(!rpc)return WebServer::arg(name);
  size_t at=0;while(at<rpcForm.length()){
   int end=rpcForm.indexOf('&',at);if(end<0)end=rpcForm.length();
   const String pair=rpcForm.substring(at,end);const int eq=pair.indexOf('=');
   if(eq>=0&&decode(pair.substring(0,eq))==name)return decode(pair.substring(eq+1));at=end+1;
  }return "";
 }
 String header(const String& name){
  if(!rpc)return WebServer::header(name);
  const char* names[]={"X-ZJ-Device","X-ZJ-Session","X-ZJ-Seq","X-ZJ-Proof"};
  for(int i=0;i<4;i++)if(name==names[i])return rpcHeaders[i];return "";
 }
 void sendHeader(const String& name,const String& value,bool first=false){
  if(!rpc){WebServer::sendHeader(name,value,first);return;}
  if(name=="X-ZJ-Response")rpcProof=value;
 }
 void send(int status,const char* type,const String& body){
  if(!rpc){WebServer::send(status,type,body);return;}rpcStatus=status;rpcBody=body;
 }
 // Strict length-prefixed UTF-8 fields; no truncation, embedded NUL or trailing bytes.
 bool dispatch(const uint8_t* bytes,size_t size,const IPAddress& peer,String& response){
  if(!size||(bytes[0]!=1&&bytes[0]!=2))return false;
  String fields[6];size_t at=1;
  for(int i=0;i<6;i++){
   if(at+2>size)return false;const size_t n=(size_t(bytes[at])<<8)|bytes[at+1];at+=2;
   if(at+n>size||n>(i==0?64:i==1?8800:80))return false;
   fields[i].reserve(n);for(size_t j=0;j<n;j++){if(!bytes[at+j])return false;fields[i]+=char(bytes[at+j]);}at+=n;
  }
  if(at!=size||!fields[0].startsWith("/api/"))return false;
  rpc=true;rpcPeer=peer;rpcPath=fields[0];rpcForm=fields[1];rpcMethod=bytes[0]==1?HTTP_GET:HTTP_POST;
  for(int i=0;i<4;i++)rpcHeaders[i]=fields[i+2];
  rpcStatus=404;rpcBody="{\"error\":\"unsupported_udp_operation\"}";rpcProof="";
  for(size_t i=0;i<routeCount;i++)if(routes[i].path==rpcPath&&routes[i].verb==rpcMethod){routes[i].run();break;}
  response="";const size_t total=4+rpcProof.length()+rpcBody.length();
  if(total<=16000){
   response.reserve(total);
   response+=char(rpcStatus>>8);response+=char(rpcStatus&255);
   response+=char(rpcProof.length()>>8);response+=char(rpcProof.length()&255);
   response+=rpcProof;response+=rpcBody;
  }
  rpc=false;rpcPath="";rpcForm="";rpcBody="";rpcProof="";for(auto& h:rpcHeaders)h="";
  return total<=16000;
 }
};

static constexpr uint16_t ZJ_RPC_PORT=4211;
static constexpr size_t ZJ_RPC_FRAGMENT=1024,ZJ_RPC_REQUEST_MAX=9216;
static WiFiUDP zjRpcSocket;
static bool zjRpcReady=false;
struct ZjRpcAssembly {
 uint8_t id[8]={};IPAddress peer;uint16_t port=0,total=0,mask=0;uint32_t at=0;
 std::unique_ptr<uint8_t[]> bytes;
};
// A telemetry observer must not destroy another client's partially received OTA.
static ZjRpcAssembly zjRpcAssembly[2];
struct ZjRpcCached {uint8_t id[8]={},hash[32]={};IPAddress peer;uint16_t port=0;uint32_t at=0;String response;};
static ZjRpcCached zjRpcCache[2];static uint8_t zjRpcCacheNext=0;
static bool zjRpcPrivate(const IPAddress& p){return p[0]==10||(p[0]==192&&p[1]==168)||(p[0]==172&&p[1]>=16&&p[1]<=31);}
static constexpr uint32_t ZJ_RPC_BUDGET_MS=3;
static constexpr uint8_t ZJ_RPC_PACKET_BUDGET=3,ZJ_RPC_RESPONSE_BURST=2;
static void (*zjRpcControlTick)()=nullptr;
struct ZjRpcResponse {uint8_t id[8]={};String body;IPAddress peer;uint16_t port=0;size_t next=0;uint32_t at=0;};
static ZjRpcResponse zjRpcResponses[2];
static uint32_t zjRpcMaxDurationMs=0,zjRpcMaxResponseDurationMs=0,zjRpcMaxPacketsPerLoop=0;
static uint32_t zjRpcResponseFailures=0,zjRpcQueueDrops=0,zjRpcBudgetExhausted=0;
static uint32_t zjRpcLastDurationMs=0,zjRpcLastPacketsPerLoop=0;
static void zjRpcSend(const uint8_t* id,const String& response,const IPAddress& peer,uint16_t port){
 for(auto& job:zjRpcResponses)if(job.port==port&&job.peer==peer&&!memcmp(job.id,id,8))return;
 for(auto& job:zjRpcResponses)if(!job.port){memcpy(job.id,id,8);job.body=response;job.peer=peer;job.port=port;job.next=0;job.at=millis();return;}
 ++zjRpcQueueDrops; // Handler result is already cached; retry must not repeat an OTA write.
}
static void zjRpcFlush(uint32_t loopAt){
 uint8_t packet[16+ZJ_RPC_FRAGMENT];uint8_t sent=0;
 for(auto& job:zjRpcResponses){
  if(!job.port)continue;
  const size_t n=job.body.length(),count=(n+ZJ_RPC_FRAGMENT-1)/ZJ_RPC_FRAGMENT;
  memcpy(packet,"ZJR1",4);memcpy(packet+4,job.id,8);packet[12]=n>>8;packet[13]=n;packet[15]=count;
  while(job.next<count&&sent<ZJ_RPC_RESPONSE_BURST&&uint32_t(millis()-loopAt)<ZJ_RPC_BUDGET_MS){
   const size_t bytes=std::min(ZJ_RPC_FRAGMENT,n-job.next*ZJ_RPC_FRAGMENT);packet[14]=job.next;
   memcpy(packet+16,job.body.c_str()+job.next*ZJ_RPC_FRAGMENT,bytes);
   const bool began=zjRpcSocket.beginPacket(job.peer,job.port)!=0;
   const bool wrote=began&&zjRpcSocket.write(packet,16+bytes)==16+bytes;
   const bool ended=began&&zjRpcSocket.endPacket()!=0;
   if(!began||!wrote||!ended)++zjRpcResponseFailures;
   ++job.next;++sent;if(zjRpcControlTick)zjRpcControlTick();
  }
  if(job.next==count){const uint32_t duration=millis()-job.at;
   if(duration>zjRpcMaxResponseDurationMs)zjRpcMaxResponseDurationMs=duration;job.port=0;job.body="";}
 }
}
static String zjRpcStatistics(){
 uint8_t depth=0;for(const auto& job:zjRpcResponses)if(job.port)++depth;
 return String("{\"maxProcessingMs\":")+String(zjRpcMaxDurationMs)+",\"maxPacketsPerLoop\":"+String(zjRpcMaxPacketsPerLoop)+
  ",\"processingMs\":"+String(zjRpcLastDurationMs)+",\"packetsPerLoop\":"+String(zjRpcLastPacketsPerLoop)+
  ",\"responseQueueDepth\":"+String(depth)+",\"maxResponseDurationMs\":"+String(zjRpcMaxResponseDurationMs)+
  ",\"responseSendFailures\":"+String(zjRpcResponseFailures)+",\"responseQueueDrops\":"+String(zjRpcQueueDrops)+
  ",\"budgetExhausted\":"+String(zjRpcBudgetExhausted)+",\"budgetMs\":3,\"packetBudget\":3}";
}
static void zjRpcSetup(){
 bool allocated=true;
 for(auto& slot:zjRpcAssembly){slot.bytes.reset(new(std::nothrow) uint8_t[ZJ_RPC_REQUEST_MAX]);allocated=allocated&&bool(slot.bytes);}
 zjRpcReady=allocated&&zjRpcSocket.begin(ZJ_RPC_PORT);
}
static void zjRpcLoop(); // defined after auth reset and common handlers
