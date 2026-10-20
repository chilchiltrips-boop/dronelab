#pragma once
#include <stddef.h>
#include <string.h>
#include <ctype.h>
// Inspect a bounded peek without consuming data. A complete request alone may
// enter WebServer's synchronous parser during control. No chunked uploads.
static constexpr size_t ZJ_HTTP_HEADER_MAX=2048,ZJ_HTTP_REQUEST_MAX=11264;
static constexpr size_t ZJ_HTTP_RESPONSE_MAX=20000,ZJ_HTTP_SEND_CHUNK=1024;
static constexpr unsigned long ZJ_HTTP_PEER_MS=500;
static int zjHttpRequestLength(const char* data,size_t size){
 size_t end=0;for(size_t i=0;i<size;i++){
  if(!data[i])return -1;
  if(i>=3&&!memcmp(data+i-3,"\r\n\r\n",4)){end=i+1;break;}
  if(i>=ZJ_HTTP_HEADER_MAX)return -1;
 }
 if(!end)return 0;if(end>ZJ_HTTP_HEADER_MAX)return -1;
 size_t line=0;while(line+1<end&&memcmp(data+line,"\r\n",2))++line;
 if(line>512||line+1>=end)return -1;
 size_t length=0;bool seen=false;
 for(size_t at=line+2;at+2<end;){
  size_t next=at;while(next+1<end&&memcmp(data+next,"\r\n",2))++next;
  size_t colon=at;while(colon<next&&data[colon]!=':')++colon;
  if(colon==next||data[at]==' '||data[at]=='\t')return -1;
  const auto named=[&](const char* name){size_t n=strlen(name);if(colon-at!=n)return false;
   for(size_t j=0;j<n;j++)if(tolower((unsigned char)data[at+j])!=name[j])return false;return true;};
  if(named("transfer-encoding"))return -1;
  if(named("content-length")){
   if(seen)return -1;seen=true;size_t pos=colon+1;while(pos<next&&(data[pos]==' '||data[pos]=='\t'))++pos;
   bool digit=false;while(pos<next&&data[pos]>='0'&&data[pos]<='9'){
    digit=true;length=length*10+(data[pos++]-'0');if(length>ZJ_HTTP_REQUEST_MAX-end)return -1;
   }
   while(pos<next&&(data[pos]==' '||data[pos]=='\t'))++pos;
   if(!digit||pos!=next)return -1;
  }
  at=next+2;
 }
 return int(end+length);
}
