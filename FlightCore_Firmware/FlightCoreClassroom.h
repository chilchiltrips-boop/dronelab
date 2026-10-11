#pragma once
// ZEBJUS AERION classroom diagnostics • NO MOTOR OUTPUTS.
// An identifying six-digit code is NOT a password or an authorization secret.
#include <Preferences.h>

static Preferences zjKitPrefs;
static String zjKitId,zjKitCode,zjKitName;
static constexpr uint32_t ZJ_RC_DEADMAN_MS=350,ZJ_RC_LEASE_MS=1800,ZJ_RC_LOG_MS=100;
static String zjRcSource="NONE",zjRcSession="";
static IPAddress zjRcOwnerIP;
static bool zjRcOwned=false,zjRcHasFrame=false,zjRcNetwork=false;
static uint32_t zjRcLeaseAt=0,zjRcLast=0,zjRcSeq=0,zjRcLastLog=0,zjRcAccepted=0,zjRcRejected=0;
static int zjRcThrottle=1000,zjRcRoll=1500,zjRcPitch=1500,zjRcYaw=1500;
static const char* zjRcTransport="NONE";

static void zjKitInfo(){
 Serial.print("ZJKIT,ID,");Serial.println(zjKitId);
 Serial.print("ZJKIT,CODE,");Serial.println(zjKitCode);
 Serial.print("ZJKIT,NAME,");Serial.println(zjKitName);
}
static void zjKitSetup(){
 const uint64_t mac=ESP.getEfuseMac();
 char id[13];snprintf(id,sizeof(id),"%012llX",(unsigned long long)(mac&0xffffffffffffULL));
 zjKitId=String(FC_BOARD)+"-"+id;
 zjKitName=FC_LABEL;
 zjKitPrefs.begin("zj-classroom",false);
 zjKitCode=zjKitPrefs.getString("code","");
 if(zjKitCode.length()!=6||zjKitCode.indexOf('-')>=0){
  char code[7];snprintf(code,sizeof(code),"%06lu",(unsigned long)(100000+(esp_random()%900000)));
  zjKitCode=code;zjKitPrefs.putString("code",zjKitCode);
 }
 for(size_t i=0;i<zjKitCode.length();++i){
  if(zjKitCode[i]<'0'||zjKitCode[i]>'9'){
   char code[7];snprintf(code,sizeof(code),"%06lu",(unsigned long)(100000+(esp_random()%900000)));
   zjKitCode=code;zjKitPrefs.putString("code",zjKitCode);break;
  }
 }
 zjKitInfo();
}
static String zjRcNewSession(){
 char token[33];snprintf(token,sizeof(token),"%08lX%08lX%08lX%08lX",
  (unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long)esp_random(),(unsigned long)esp_random());
 return String(token);
}
static void zjRcNeutral(){
 zjRcThrottle=1000;zjRcRoll=zjRcPitch=zjRcYaw=1500;zjRcHasFrame=false;
}
static void zjRcRelease(const char* reason){
 const bool had=zjRcOwned;
 zjRcNeutral();zjRcOwned=false;zjRcNetwork=false;zjRcLeaseAt=0;zjRcLast=0;zjRcSeq=0;
 zjRcSession="";zjRcSource="NONE";zjRcTransport="NONE";
 if(had&&Serial.availableForWrite()>70){Serial.print("ZJRC,RELEASE,");Serial.println(reason);}
}
static bool zjRcClaim(const String& source,const String& code,bool network,const IPAddress& ip,const char* transport){
 if(code!=zjKitCode||(source!="WEB"&&source!="ANDROID")){++zjRcRejected;return false;}
 const uint32_t now=millis();
 if(zjRcOwned&&now-zjRcLeaseAt<=ZJ_RC_LEASE_MS){++zjRcRejected;return false;}
 if(zjRcOwned)zjRcRelease("LEASE_EXPIRED");
 zjRcOwned=true;zjRcNetwork=network;zjRcSource=source;zjRcOwnerIP=ip;
 zjRcTransport=transport;zjRcSession=zjRcNewSession();zjRcSeq=0;
 zjRcLast=0;zjRcLeaseAt=now;zjRcNeutral();
 if(Serial.availableForWrite()>75){Serial.print("ZJRC,CLAIM,");Serial.print(transport);Serial.print(',');Serial.println(source);}
 return true;
}
static bool zjRcFrame(uint32_t seq,int t,int r,int p,int y,const String& source,const String& session,bool network,const IPAddress& ip){
 const uint32_t now=millis();
 if(!zjRcOwned||zjRcNetwork!=network||zjRcSource!=source||now-zjRcLeaseAt>ZJ_RC_LEASE_MS||
    (network&&(session!=zjRcSession||ip!=zjRcOwnerIP))||
    seq==0||(zjRcSeq!=0&&int32_t(seq-zjRcSeq)<=0)||
    t<1000||t>2000||r<1000||r>2000||p<1000||p>2000||y<1000||y>2000){
  ++zjRcRejected;return false;
 }
 zjRcThrottle=t;zjRcRoll=r;zjRcPitch=p;zjRcYaw=y;
 zjRcSeq=seq;zjRcLeaseAt=now;zjRcLast=now;zjRcHasFrame=true;++zjRcAccepted;
 // Maximum 10 diagnostic frames/s; sensors and Wi-Fi service take priority.
 if(now-zjRcLastLog>=ZJ_RC_LOG_MS&&Serial.availableForWrite()>100){
  zjRcLastLog=now;
  Serial.printf("ZJRC,%s,%s,%lu,T=%d,R=%d,P=%d,Y=%d\n",zjRcTransport,zjRcSource.c_str(),
   (unsigned long)seq,t,r,p,y);
 }
 return true;
}
static void zjRcLoop(uint32_t now){
 if(zjRcHasFrame&&now-zjRcLast>ZJ_RC_DEADMAN_MS){
  zjRcNeutral();
  if(Serial.availableForWrite()>60)Serial.println("ZJRC,FAILSAFE,INPUT_TIMEOUT");
 }
 if(zjRcOwned&&now-zjRcLeaseAt>ZJ_RC_LEASE_MS)zjRcRelease("LEASE_TIMEOUT");
}
static String zjRcState(){
 const uint32_t age=zjRcHasFrame?millis()-zjRcLast:0;
 return String("{\"claimed\":")+(zjRcOwned?"true":"false")+
  ",\"active\":"+(zjRcHasFrame?"true":"false")+",\"source\":\""+zjRcSource+
  "\",\"transport\":\""+zjRcTransport+"\",\"seq\":"+String(zjRcSeq)+
  ",\"ageMs\":"+String(age)+",\"throttle\":"+String(zjRcThrottle)+
  ",\"roll\":"+String(zjRcRoll)+",\"pitch\":"+String(zjRcPitch)+
  ",\"yaw\":"+String(zjRcYaw)+",\"accepted\":"+String(zjRcAccepted)+
  ",\"rejected\":"+String(zjRcRejected)+",\"motorsArmed\":false}";
}
static bool zjRcSerialCommand(char* line){
 if(!strcmp(line,"ZJKIT,GET")){zjKitInfo();return true;}
 if(!strncmp(line,"ZJKIT,CODE,",11)){
  const char* code=line+11;bool valid=strlen(code)==6;
  for(int i=0;valid&&i<6;i++)valid=code[i]>='0'&&code[i]<='9';
  if(!valid||zjRcOwned){Serial.println("ZJKIT,ERR,CODE_INVALID_OR_LOCKED");return true;}
  zjKitCode=code;zjKitPrefs.putString("code",zjKitCode);
  Serial.print("ZJKIT,ACK,CODE,");Serial.println(zjKitCode);
  Serial.println("ZJKIT,INFO,VERIFY_NO_DUPLICATE_IN_CLASSROOM");return true;
 }
 if(!strcmp(line,"ZJRC,STOP")){zjRcRelease("USB_STOP");return true;}
 if(!strcmp(line,"ZJRC,RELEASE")){
  if(zjRcOwned&&!zjRcNetwork)zjRcRelease("USB_RELEASE");
  else Serial.println("ZJRC,ERR,NOT_USB_OWNER");
  return true;
 }
 if(!strncmp(line,"ZJRC,CLAIM,",11)){
  char* s=nullptr;char* source=strtok_r(line+11,",",&s),*code=strtok_r(nullptr,",",&s);
  if(!source||!code||strtok_r(nullptr,",",&s)||!zjRcClaim(source,code,false,IPAddress(),"USB"))
   Serial.println("ZJRC,ERR,CLAIM_REJECTED");
  else Serial.println("ZJRC,ACK,CLAIM,USB");
  return true;
 }
 if(!strncmp(line,"ZJRC,SET,",9)){
  char* s=nullptr;char* seqText=strtok_r(line+9,",",&s);
  char* tText=strtok_r(nullptr,",",&s),*rText=strtok_r(nullptr,",",&s);
  char* pText=strtok_r(nullptr,",",&s),*yText=strtok_r(nullptr,",",&s);
  char* source=strtok_r(nullptr,",",&s);
  long seq=0,t=0,r=0,p=0,y=0;
  if(!seqText||!source||strtok_r(nullptr,",",&s)||
     !parseNumber(seqText,1,2147483647L,seq)||!parseNumber(tText,1000,2000,t)||
     !parseNumber(rText,1000,2000,r)||!parseNumber(pText,1000,2000,p)||
     !parseNumber(yText,1000,2000,y)||
     !zjRcFrame(uint32_t(seq),int(t),int(r),int(p),int(y),source,"",false,IPAddress()))
   Serial.println("ZJRC,ERR,FRAME_REJECTED");
  return true;
 }
 return false;
}
