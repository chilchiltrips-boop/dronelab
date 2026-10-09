#pragma once
#include "SecureFrames.h"
#include "WebAppScope.h"
WebAppScope::Registry webAppRegistry;
bool secureMonitorAllowed(uint64_t);void secureMonitorSeen(uint64_t);
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <mbedtls/bignum.h>
#include <memory>
#include "src/crypto/esp_srp.h"
struct SecureSession {
 uint64_t id=0,send=0,ackSend=0,monitorSend=0;uint32_t expires=0,lastActivity=0;
 String client,role,credential;uint8_t keys[5][32]={};ZfcSecure::ReplayWindow httpReplay,rcReplay;
};
SecureSession secureSessions[6];SemaphoreHandle_t secureMutex=nullptr;
String secureHex(const uint8_t* p,size_t n){static const char h[]="0123456789abcdef";String s;s.reserve(n*2);for(size_t i=0;i<n;i++){s+=h[p[i]>>4];s+=h[p[i]&15];}return s;}
bool secureUnhex(const String& s,uint8_t* p,size_t n){if(s.length()!=n*2)return false;for(size_t i=0;i<n;i++){int a=tolower(s[i*2]),b=tolower(s[i*2+1]);a=a>='0'&&a<='9'?a-'0':a>='a'&&a<='f'?a-'a'+10:-1;b=b>='0'&&b<='9'?b-'0':b>='a'&&b<='f'?b-'a'+10:-1;if(a<0||b<0)return false;p[i]=(a<<4)|b;}return true;}
String secureId(uint64_t n){char b[17];snprintf(b,sizeof(b),"%016llx",(unsigned long long)n);return String(b);}
bool secureApWifiSessionAllowed(const String&);
SecureSession* secureFind(uint64_t id){for(auto& s:secureSessions)if(s.id==id&&id&&(int32_t)(s.expires-millis())>0&&secureApWifiSessionAllowed(s.credential))return &s;return nullptr;}
inline uint64_t secureReadLE(const uint8_t* p){uint64_t n=0;for(int i=0;i<8;i++)n|=uint64_t(p[i])<<(i*8);return n;}
inline void secureWriteLE(uint8_t* p,uint64_t n){for(int i=0;i<8;i++)p[i]=n>>(i*8);}
// UDP has its own counters and keys. Plain ZRC1/2 frames are never accepted on secure firmware.
bool secureRcOpen(const uint8_t* packet,size_t n,uint8_t plain[48],uint64_t& sid){
 if(n!=88||memcmp(packet,"ZSC3",4)||packet[22]!=1||packet[23]!=0||packet[20]!=48||packet[21])return false;
 sid=secureReadLE(packet+4);uint64_t seq=secureReadLE(packet+12);if(xSemaphoreTake(secureMutex,pdMS_TO_TICKS(2))!=pdTRUE)return false;
 auto* s=secureFind(sid);bool ok=s&&s->role=="MOBILE"&&s->rcReplay.allowed(seq)&&ZfcSecure::open(s->keys[2],seq,packet,24,packet+24,64,plain);
 if(ok)s->rcReplay.accept(seq);xSemaphoreGive(secureMutex);return ok;
}
bool secureRcAck(uint64_t sid,const uint8_t plain[28],uint8_t out[68]){
 if(xSemaphoreTake(secureMutex,pdMS_TO_TICKS(2))!=pdTRUE)return false;auto* s=secureFind(sid);bool ok=false;
 if(s){memcpy(out,"ZSC3",4);secureWriteLE(out+4,sid);secureWriteLE(out+12,++s->ackSend);out[20]=28;out[21]=0;out[22]=2;out[23]=0;ok=ZfcSecure::seal(s->keys[3],s->ackSend,out,24,plain,28,out+24);}
 xSemaphoreGive(secureMutex);return ok;
}
String secureUrlDecode(const String& v){String s;for(size_t i=0;i<v.length();i++){if(v[i]=='+')s+=' ';else if(v[i]=='%'&&i+2<v.length()){uint8_t b;if(!secureUnhex(v.substring(i+1,i+3),&b,1)||!b)return String();s+=(char)b;i+=2;}else s+=v[i];}return s;}
String secureParam(const String& form,const char* key){String match=String(key)+"=";int at=form.startsWith(match)?0:form.indexOf("&"+match);if(at<0)return String();if(at)at++;at+=match.length();int end=form.indexOf('&',at);return secureUrlDecode(form.substring(at,end<0?form.length():end));}
uint64_t secureMonitorSubscribe(const char* request,const String& device){
 String first(request);int end=first.indexOf(" HTTP/");if(!first.startsWith("GET /api/rc/live?")||end<0)return 0;String query=first.substring(17,end);
 String sid=secureParam(query,"sessionId"),counter=secureParam(query,"seq"),encoded=secureParam(query,"cipher");uint8_t idbytes[8];
 if(!secureUnhex(sid,idbytes,8)||counter.length()<1||counter.length()>19||encoded.length()<32||encoded.length()>2000||encoded.length()%2)return 0;
 for(char c:counter)if(c<'0'||c>'9')return 0;uint64_t id=strtoull(sid.c_str(),nullptr,16),seq=strtoull(counter.c_str(),nullptr,10);size_t n=encoded.length()/2;
 auto cipher=std::unique_ptr<uint8_t[]>(new uint8_t[n]);auto plain=std::unique_ptr<uint8_t[]>(new uint8_t[n]);if(!secureUnhex(encoded,cipher.get(),n))return 0;
 String aad="ZFC3|"+sid+"|"+counter+"|HTTP_C2S";if(xSemaphoreTake(secureMutex,pdMS_TO_TICKS(5))!=pdTRUE)return 0;auto* s=secureFind(id);
 bool ok=s&&s->httpReplay.allowed(seq)&&ZfcSecure::open(s->keys[0],seq,(uint8_t*)aad.c_str(),aad.length(),cipher.get(),n,plain.get());
 if(ok){plain[n-16]=0;String p((char*)plain.get());ok=secureParam(p,"path")=="/api/rc/live"&&secureParam(p,"method")=="GET"&&secureParam(p,"expectedDeviceId")==device&&secureParam(p,"clientId")==s->client;if(ok)ok=secureMonitorAllowed(id);if(ok)s->httpReplay.accept(seq);}
 xSemaphoreGive(secureMutex);memset(plain.get(),0,n);return ok?id:0;
}
bool secureMonitorSeal(uint64_t sid,const char* plain,char* out,size_t capacity){
 if(xSemaphoreTake(secureMutex,pdMS_TO_TICKS(5))!=pdTRUE)return false;auto* s=secureFind(sid);if(!s||!secureMonitorAllowed(sid)){xSemaphoreGive(secureMutex);return false;}secureMonitorSeen(sid);
 uint64_t seq=++s->monitorSend;uint8_t key[32];memcpy(key,s->keys[4],32);xSemaphoreGive(secureMutex);size_t n=strlen(plain);auto cipher=std::unique_ptr<uint8_t[]>(new uint8_t[n+16]);String id=secureId(sid),counter=String((unsigned long long)seq),aad="ZFC3|"+id+"|"+counter+"|MONITOR_S2C";
 bool ok=ZfcSecure::seal(key,seq,(uint8_t*)aad.c_str(),aad.length(),(uint8_t*)plain,n,cipher.get());memset(key,0,32);if(!ok)return false;
 String envelope="{\"sessionId\":\""+id+"\",\"seq\":\""+counter+"\",\"cipher\":\""+secureHex(cipher.get(),n+16)+"\"}\n";
 if(envelope.length()+1>capacity)return false;memcpy(out,envelope.c_str(),envelope.length()+1);return true;
}
