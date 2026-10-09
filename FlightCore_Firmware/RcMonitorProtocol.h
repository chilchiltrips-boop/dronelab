#pragma once
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
// Read-only NDJSON1 subscription. No owner, token or command enters this port.
namespace RcMonitorProtocol {
constexpr uint16_t PORT=4211;
constexpr uint32_t PERIOD_MS=100, CLIENT_TIMEOUT_MS=1200;
constexpr size_t REQUEST_BYTES=1200, PACKET_BYTES=3072;
inline int requestKind(const char* request,const char* device){
 char line[128];snprintf(line,sizeof(line),"GET /api/rc/live?deviceId=%s HTTP/1.1\r\n",device);
 if(strncmp(request,line,strlen(line))==0)return 1;
 snprintf(line,sizeof(line),"OPTIONS /api/rc/live?deviceId=%s HTTP/1.1\r\n",device);
 return strncmp(request,line,strlen(line))==0?2:0;
}
inline size_t chunk(char* out,size_t capacity,const char* json){
 size_t length=strlen(json);int n=snprintf(out,capacity,"%x\r\n%s\n\r\n",(unsigned)(length+1),json);
 return n>0&&(size_t)n<capacity?(size_t)n:0;
}
}
