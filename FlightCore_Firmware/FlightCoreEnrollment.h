#pragma once
// Label enrollment: no BOOT-pin assumption, no public-code authorization.
// Manufacturer writes a random 256-bit label secret using protected USB admin.
#include <mbedtls/md.h>
#include <mbedtls/gcm.h>
#include <memory>
#include <new>
// A 1024-byte OTA chunk expands to ~2068 form-encoded plaintext bytes.
// AES-GCM adds a nonce and tag; the encrypted envelope is transmitted as hex.
// Bound the payload and allocate on the heap, not the ESP32 HTTP task stack.
static constexpr size_t ZJ_AUTH_PAYLOAD_HEX_MAX=8704; // hard max for verified OTA chunk only
static constexpr size_t ZJ_AUTH_STANDARD_PAYLOAD_HEX_MAX=4352;

static String zjLabelSecret,zjDiagnosticKey,zjBootId,zjAuthBody;
struct ZjChallenge {String nonce,kind,client;IPAddress ip;uint32_t at=0;};
struct ZjSession {String id,key,client;uint32_t at=0,seq=0;bool setup=false,admin=false,local=false,localSta=false;IPAddress ip;};
static ZjChallenge zjChallenges[4];static ZjSession zjSessions[8];
static uint32_t zjAuthCooldown=0,zjChallengeAt=0;static uint8_t zjAuthFailures=0;
static int zjRequestSession=-1;static bool zjAuthChecked=false,zjAuthAdmin=false;
static bool zjHex(const String& v,size_t n){if(v.length()!=n)return false;for(size_t i=0;i<n;i++)if(!isxdigit(v[i]))return false;return true;}
static bool zjEqual(const String& a,const String& b){if(a.length()!=b.length())return false;uint8_t d=0;for(size_t i=0;i<a.length();i++)d|=a[i]^b[i];return d==0;}
static String zjHexBytes(const uint8_t* p,size_t n){const char* hex="0123456789abcdef";String s;s.reserve(n*2);for(size_t i=0;i<n;i++){s+=hex[p[i]>>4];s+=hex[p[i]&15];}return s;}
static void zjUnhex(const String& s,uint8_t* p){for(size_t i=0;i<s.length()/2;i++)p[i]=strtoul(s.substring(i*2,i*2+2).c_str(),nullptr,16);}
static String zjHmac(const String& key,const String& message){
 uint8_t digest[32];if(mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),(const uint8_t*)key.c_str(),key.length(),(const uint8_t*)message.c_str(),message.length(),digest))return "";
 return zjHexBytes(digest,32);
}
static void zjEnrollmentInit(){
 zjLabelSecret=zjPrefs.getString("label","");zjLabelSecret.toLowerCase();zjBootId=zjNewSecret(16);
 zjDiagnosticKey=zjHex(zjLabelSecret,64)?zjHmac(zjLabelSecret,"diagnostic|"+zjKitId).substring(0,32):String("");
 for(auto& s:zjSessions)s=ZjSession();for(auto& c:zjChallenges)c=ZjChallenge();
}
static void zjAuthResetRequest(){zjAuthChecked=false;zjAuthAdmin=false;zjRequestSession=-1;zjAuthBody="";}
static String zjUrlDecode(const String& in){String out;for(size_t i=0;i<in.length();i++){if(in[i]=='+')out+=' ';else if(in[i]=='%'&&i+2<in.length()&&zjHex(in.substring(i+1,i+3),2)){out+=char(strtoul(in.substring(i+1,i+3).c_str(),nullptr,16));i+=2;}else out+=in[i];}return out;}
static String zjArg(const String& name){
 if(zjRequestSession<0)return zjHttp.arg(name);
 size_t at=0;while(at<zjAuthBody.length()){int end=zjAuthBody.indexOf('&',at);if(end<0)end=zjAuthBody.length();String pair=zjAuthBody.substring(at,end);int eq=pair.indexOf('=');if(eq>=0&&zjUrlDecode(pair.substring(0,eq))==name)return zjUrlDecode(pair.substring(eq+1));at=end+1;}return "";
}
// AP signed sessions allow direct Wi-Fi setup; STA observer sessions stay read-only. Neither grants admin or OTA.
static bool zjLocalDiagnosticRoute(){
 const String path=zjHttp.uri();const bool get=zjHttp.method()==HTTP_GET;
 const bool ap=String(zjClientTransport())=="AP";
 if(get)return (path=="/api/status"||path=="/api/telemetry"||path=="/api/rc/snapshot")||
   (ap&&(path=="/api/wifi/scan"||path=="/api/wifi/saved"));
 if(!ap)return path=="/api/auth/close"; // STA local sessions are observer-only
 return (path=="/api/command"||path=="/api/rc/claim"||path=="/api/rc/preview"||
   path=="/api/rc/release"||path=="/api/rc/stop"||path=="/api/rc/observe"||path=="/api/flight/mode"||path=="/api/auth/close")||
   (path=="/api/wifi/test"||path=="/api/wifi/mode"||path=="/api/wifi/use"||path=="/api/wifi/forget"||path=="/api/kit/name"||path=="/api/kit/name/reset");
}
static bool zjSessionAuthenticated(){
 if(zjAuthChecked)return zjAuthAdmin||zjRequestSession>=0;zjAuthChecked=true;
 // Legacy raw X-ZJ-Key grants were formerly broad admin authority on every
 // HTTP endpoint. Retired: ALL authenticated routes need a verified, scoped
 // challenge/enroll session, monotonic proof and AES-GCM for POST requests.
 // The same device-specific secret may be used ONLY to derive a signed admin
 // session during /api/auth/enroll. It is never accepted as a bearer header.
 if(zjHttp.header("X-ZJ-Key").length())return false;
 if(zjHttp.header("X-ZJ-Device")!=zjKitId)return false;
 const String id=zjHttp.header("X-ZJ-Session"),counter=zjHttp.header("X-ZJ-Seq"),payload=zjHttp.arg("payload");
 if(counter.length()>10||!counter.length()||payload.length()>ZJ_AUTH_PAYLOAD_HEX_MAX)return false;
 for(size_t i=0;i<counter.length();i++)if(!isdigit(counter[i]))return false;
 const uint64_t wide=strtoull(counter.c_str(),nullptr,10);if(!wide||wide>0xffffffffULL)return false;
 for(int i=0;i<8;i++){
  auto& s=zjSessions[i];if(s.id!=id||id.isEmpty())continue;
  if(s.admin&&s.ip!=zjHttp.peerIP())return false;
   // Larger heap-backed encrypted envelopes are permitted only for an
   // authenticated OWNER session writing a firmware chunk, not generic APIs.
   const bool otaChunk=s.admin&&zjHttp.method()==HTTP_POST&&zjHttp.uri()=="/api/firmware/chunk";
   if(!otaChunk&&payload.length()>ZJ_AUTH_STANDARD_PAYLOAD_HEX_MAX)return false;
  if(s.local&&(s.ip!=zjHttp.peerIP()||(s.localSta?String(zjClientTransport())!="STA":String(zjClientTransport())!="AP")||!zjLocalDiagnosticRoute()))return false;
  if(uint32_t(millis()-s.at)>1800000||wide<=s.seq)return false;
  const String method=zjHttp.method()==HTTP_GET?"GET":"POST";
  const String msg=method+"|"+zjHttp.uri()+"|"+zjKitId+"|"+zjBootId+"|"+id+"|"+counter+"|"+payload;
  if(!zjEqual(zjHmac(s.key,msg),zjHttp.header("X-ZJ-Proof")))return false;
  if(method=="POST"){
   if(payload.length()<56||payload.length()%2||!zjHex(payload,payload.length()))return false;
   const size_t cipherBytes=payload.length()/2,n=cipherBytes-28;
   std::unique_ptr<uint8_t[]> bytes(new(std::nothrow) uint8_t[cipherBytes]);
   std::unique_ptr<uint8_t[]> plain(new(std::nothrow) uint8_t[n+1]);
   if(!bytes||!plain)return false;
   uint8_t key[32];zjUnhex(payload,bytes.get());zjUnhex(s.key,key);
   mbedtls_gcm_context ctx;mbedtls_gcm_init(&ctx);
   int err=mbedtls_gcm_setkey(&ctx,MBEDTLS_CIPHER_ID_AES,key,256);
   if(!err)err=mbedtls_gcm_auth_decrypt(&ctx,n,bytes.get(),12,(const uint8_t*)msg.c_str(),0,bytes.get()+12+n,16,bytes.get()+12,plain.get());
   mbedtls_gcm_free(&ctx);if(err)return false;plain[n]=0;zjAuthBody=String((const char*)plain.get());
  }
  s.seq=uint32_t(wide);zjRequestSession=i;zjAuthAdmin=s.admin;return true;
 }return false;
}
static bool zjSetupAuthorized(){
 if(zjAuthAdmin)return true;
 if(zjRequestSession<0)return false;
 const auto& s=zjSessions[zjRequestSession];
 return (s.setup&&uint32_t(millis()-s.at)<300000)||
   (s.local&&!s.localSta&&String(zjClientTransport())=="AP");
}
static void zjSetupEnrollmentHttp(){
 zjHttp.on("/api/auth/local",HTTP_POST,[](){
  const bool ap=String(zjClientTransport())=="AP",sta=String(zjClientTransport())=="STA";
  if(!ap&&!sta){zjReply(403,"{\"error\":\"local_network_required\"}");return;}
  const String client=zjHttp.arg("client");if(!zjHex(client,32)||zjHttp.arg("deviceId")!=zjKitId){zjReply(400,"{\"error\":\"invalid_local_identity\"}");return;}
  const uint32_t now=millis();const IPAddress ip=zjHttp.peerIP();int slot=-1;
  for(int i=0;i<4;i++)if(zjSessions[i].local&&zjSessions[i].client==client&&zjSessions[i].ip==ip){slot=i;break;}
  if(slot<0)for(int i=0;i<4;i++)if(zjSessions[i].id.isEmpty()||uint32_t(now-zjSessions[i].at)>1800000){slot=i;break;}
  if(slot<0){zjReply(429,"{\"error\":\"session_capacity_reached\"}");return;}
  auto& session=zjSessions[slot];session=ZjSession();session.local=true;session.localSta=sta;session.ip=ip;session.client=client;session.id=zjNewSecret(16);session.key=zjNewSecret(32);session.at=now;
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"bootId\":"+zjJson(zjBootId)+",\"session\":"+zjJson(session.id)+",\"key\":"+zjJson(session.key)+",\"scope\":"+zjJson(ap?"ap_diagnostics":"sta_observer")+",\"expiresMs\":1800000,\"setupExpiresMs\":0}");
 });
 zjHttp.on("/api/auth/challenge",HTTP_POST,[](){
  const uint32_t now=millis();const String kind=zjHttp.arg("kind"),client=zjHttp.arg("client");
  if(!zjHex(client,32)){zjReply(400,"{\"error\":\"invalid_client_id\"}");return;}
  if(kind!="admin"&&!zjLabelSecret.length()){zjReply(409,"{\"error\":\"manufacturer_label_not_installed\"}");return;}
  if((kind!="setup"&&kind!="diagnostic"&&kind!="admin")||(kind=="setup"&&String(zjClientTransport())!="AP")){zjReply(403,"{\"error\":\"setup_requires_kit_ap\"}");return;}
  if((zjAuthCooldown&&int32_t(now-zjAuthCooldown)<0)||(zjChallengeAt&&uint32_t(now-zjChallengeAt)<300)){zjReply(429,"{\"error\":\"enrollment_rate_limited\"}");return;}
  int slot=-1;for(int i=0;i<4;i++)if(zjChallenges[i].nonce.isEmpty()||uint32_t(now-zjChallenges[i].at)>30000){slot=i;break;}
  if(slot<0){zjReply(429,"{\"error\":\"challenge_busy\"}");return;}
  auto& c=zjChallenges[slot];c.nonce=zjNewSecret(16);c.at=now;c.ip=zjHttp.peerIP();c.kind=kind;c.client=client;zjChallengeAt=now;
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"nonce\":"+zjJson(c.nonce)+",\"bootId\":"+zjJson(zjBootId)+",\"expiresMs\":30000}");
 });
 zjHttp.on("/api/auth/enroll",HTTP_POST,[](){
  const uint32_t now=millis();if(zjAuthCooldown&&int32_t(now-zjAuthCooldown)<0){zjReply(429,"{\"error\":\"enrollment_rate_limited\"}");return;}
  for(auto& c:zjChallenges){
   if(c.nonce.isEmpty()||c.nonce!=zjHttp.arg("nonce")||c.ip!=zjHttp.peerIP())continue;
   const String nonce=c.nonce,kind=c.kind,client=c.client;c.nonce=""; // consume before verification: no replay
   const String msg="enroll|"+zjKitId+"|"+zjBootId+"|"+nonce+"|"+kind+"|"+client;
   const String credential=kind=="admin"?zjNetKey:kind=="setup"?zjLabelSecret:zjDiagnosticKey;
   if(uint32_t(now-c.at)>30000||zjHttp.arg("deviceId")!=zjKitId||!zjEqual(zjHmac(credential,msg),zjHttp.arg("proof"))){
    if(++zjAuthFailures>=3){zjAuthCooldown=now+30000;zjAuthFailures=0;}zjReply(401,"{\"error\":\"enrollment_proof_invalid_or_expired\"}");return;
   }
   int slot=-1;for(int i=0;i<8;i++)if(zjSessions[i].client==client&&!client.isEmpty()){slot=i;break;}
   if(slot<0)for(int i=0;i<8;i++)if(zjSessions[i].id.isEmpty()||uint32_t(now-zjSessions[i].at)>1800000){slot=i;break;}
   if(slot<0){zjReply(429,"{\"error\":\"session_capacity_reached\"}");return;}
   auto& s=zjSessions[slot];s=ZjSession();s.client=client;s.id=zjNewSecret(16);s.at=now;s.seq=0;s.setup=kind=="setup";s.admin=kind=="admin";s.ip=c.ip;s.local=false;
   s.key=zjHmac(credential,"session|"+msg+"|"+s.id);zjAuthFailures=0;
   zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"session\":"+zjJson(s.id)+",\"proof\":"+zjJson(zjHmac(s.key,"server|"+msg))+",\"expiresMs\":1800000,\"setupExpiresMs\":"+String(s.setup?300000:0)+"}");return;
  }zjReply(401,"{\"error\":\"challenge_invalid_or_consumed\"}");
 });
 zjHttp.on("/api/auth/close",HTTP_POST,[](){if(!zjAllow())return;const int slot=zjRequestSession;zjReply(200,"{\"closed\":true}");if(slot>=0)zjSessions[slot]=ZjSession();});
}
