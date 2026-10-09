#pragma once
#include <lwip/sockets.h>
#include <errno.h>
#include "RcMonitorProtocol.h"
// The bounded observer task has no control, token or HTTP-command worker.
WiFiServer rcMonitorServer(RcMonitorProtocol::PORT,3);
TaskHandle_t rcMonitorTaskHandle=nullptr;
uint32_t rcMonitorFrames=0,rcMonitorSlowClients=0;
struct RcMonitorClient {
 WiFiClient socket;char bytes[RcMonitorProtocol::PACKET_BYTES];size_t length=0,offset=0,requestLength=0;
 uint64_t secureSession=0;uint32_t changedAt=0;bool subscribed=false,closeAfter=false;
 void close(){socket.stop();length=offset=requestLength=0;subscribed=closeAfter=false;secureSession=0;}
 void queue(const char* text,uint32_t now){length=strlen(text);memcpy(bytes,text,length);offset=0;changedAt=now;}
};
// One task owns these fixed buffers. BSS leaves room for ESP32 ROM printf
// and socket call stacks; the former automatic task frame used 6672 bytes.
struct RcMonitorWorkspace {RcMonitorClient clients[3];char json[1000],encrypted[2600],chunk[RcMonitorProtocol::PACKET_BYTES],header[512];};
RcMonitorWorkspace rcMonitorWorkspace;
void rcMonitorTask(void*){
 auto& clients=rcMonitorWorkspace.clients;auto& json=rcMonitorWorkspace.json;auto& chunk=rcMonitorWorkspace.chunk;auto& header=rcMonitorWorkspace.header;
 for(auto& c:clients)c.close();uint32_t publishedAt=0;
 for(;;){
  uint32_t now=millis();WiFiClient incoming=rcMonitorServer.accept();
  if(incoming){bool used=false;for(auto& c:clients)if(!c.socket.connected()){c.close();c.socket=incoming;c.socket.setNoDelay(true);c.changedAt=now;used=true;break;}if(!used)incoming.stop();}
  bool publish=(uint32_t)(now-publishedAt)>=RcMonitorProtocol::PERIOD_MS;size_t packetLength=0;
  if(publish){publishedAt=now;bool subscribed=false;for(auto& c:clients)if(c.subscribed&&c.socket.connected()){subscribed=true;break;}if(subscribed){buildRcMonitorPacket(json,sizeof(json));packetLength=strlen(json);}}
  for(auto& c:clients){
   if(!c.socket.connected()){c.close();continue;}
   if(!c.subscribed&&!c.length){
    for(int count=0;count<128&&c.socket.available();count++){
     int byte=c.socket.read();if(byte<0)break;if(c.requestLength+1>=RcMonitorProtocol::REQUEST_BYTES){c.close();break;}
     c.bytes[c.requestLength++]=(char)byte;c.bytes[c.requestLength]=0;
     if(c.requestLength>=4&&!strcmp(c.bytes+c.requestLength-4,"\r\n\r\n")){
      int kind=strncmp(c.bytes,"OPTIONS /api/rc/live?",21)==0?2:0;if(strncmp(c.bytes,"OPTIONS ",8)!=0){c.secureSession=secureMonitorSubscribe(c.bytes,deviceId);kind=c.secureSession?1:0;}c.requestLength=0;
      const char* cors="Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Private-Network: true\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: no-store\r\n";
      snprintf(header,sizeof(header),kind==1?"HTTP/1.1 200 OK\r\n%sContent-Type: application/x-ndjson\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n":kind==2?"HTTP/1.1 204 No Content\r\n%sContent-Length: 0\r\nConnection: close\r\n\r\n":"HTTP/1.1 404 Not Found\r\n%sContent-Length: 0\r\nConnection: close\r\n\r\n",cors);
      c.subscribed=kind==1;c.closeAfter=kind!=1;c.queue(header,now);break;
     }
    }
    if(!c.socket.connected())continue;
    if(!c.subscribed&&!c.length&&(uint32_t)(now-c.changedAt)>RcMonitorProtocol::CLIENT_TIMEOUT_MS){c.close();continue;}
   }
   if(c.subscribed&&!c.length&&publish&&packetLength){if(!secureMonitorSeal(c.secureSession,json,rcMonitorWorkspace.encrypted,sizeof(rcMonitorWorkspace.encrypted))){c.close();continue;}size_t secureLength=RcMonitorProtocol::chunk(chunk,sizeof(chunk),rcMonitorWorkspace.encrypted);if(!secureLength){c.close();continue;}memcpy(c.bytes,chunk,secureLength);c.length=secureLength;c.offset=0;c.changedAt=now;rcMonitorFrames++;}
   if(c.length){
    int sent=::send(c.socket.fd(),c.bytes+c.offset,c.length-c.offset,MSG_DONTWAIT);
    if(sent>0){c.offset+=(size_t)sent;if(c.offset==c.length){c.length=c.offset=0;if(c.closeAfter)c.close();}}
    else if(sent<0&&errno!=EAGAIN&&errno!=EWOULDBLOCK){c.close();continue;}
    if(c.length&&(uint32_t)(now-c.changedAt)>RcMonitorProtocol::CLIENT_TIMEOUT_MS){rcMonitorSlowClients++;c.close();}
   }
  }
  vTaskDelay(pdMS_TO_TICKS(2));
 }
}
void startRcMonitor(){

 if(rcMonitorTaskHandle)return;rcMonitorServer.begin();rcMonitorServer.setNoDelay(true);
 if(xTaskCreate(rcMonitorTask,"aerion-rc-view",8192,nullptr,1,&rcMonitorTaskHandle)!=pdPASS){rcMonitorServer.end();rcMonitorTaskHandle=nullptr;}
}
