// Exercises the ACTUAL firmware RC and enrollment headers with fake time/HTTP.
// OpenSSL supplies the host crypto primitives; board compilation uses mbedTLS.
#include "host-stubs/ArduinoShim.h"
#include <cassert>
#include <iostream>
#include <vector>
#include "../FlightCore_Firmware/FlightCoreClassroom.h"
// Host-only stub: no physical PPM receiver is attached to native C++ unit tests.
static String zjPpmRcChannelsJson(){return String("null");}
static String zjPpmRcSignalJson(){return String("\"UNKNOWN\"");}
const int HTTP_GET=1,HTTP_POST=2;static IPAddress requestIP(192,168,4,2);
struct FakeHttp {
 std::map<String,String> headers,args;std::map<String,std::function<void()>> handlers;String path;int verb=HTTP_GET;
 String arg(String n){return args[n];}String header(String n){return headers[n];}String uri(){return path;}int method(){return verb;}
 IPAddress peerIP(){return requestIP;}
 template<class F>void on(String p,int,F f){handlers[p]=f;}
} zjHttp;
static Preferences zjPrefs;static String zjNetKey="ff112233445566778899aabbccddeeff0";
static String zjJson(const String& v){return String("\"")+v+"\"";}
static String zjSavedSsid,zjSavedPass;
#include "../FlightCore_Firmware/FlightCoreWifiProfiles.h"
static String zjNewSecret(size_t n){String out;for(size_t i=0;i<n;i++){char b[3];snprintf(b,3,"%02x",esp_random()%256);out+=b;}return out;}
static String transport="AP",replyBody;static int replyStatus=0;
static const char* zjClientTransport(){return transport.c_str();}
static void zjReply(int status,const String& body){replyStatus=status;replyBody=body;}
static bool zjAllow();
#include "../FlightCore_Firmware/FlightCoreEnrollment.h"
static bool zjAllow(){return zjSessionAuthenticated();}
static bool zjNetTesting=false,zjOtaAuthorized=false,zjUsbScanning=false;
static uint32_t zjOtaRebootAt=0;
static constexpr int U_FLASH=0;
struct OtaFlash {
 std::vector<uint8_t> written;bool activated=false,failWrite=false;
 bool begin(size_t n,int){written.clear();activated=false;return n<=0x1e0000;}
 size_t write(const uint8_t* p,size_t n){if(failWrite)return 0;written.insert(written.end(),p,p+n);return n;}
 void abort(){written.clear();activated=false;}bool end(bool){activated=true;return true;}
} Update;
#include "../FlightCore_Firmware/FlightCoreOta.h"
static void prepare(String route,int method=HTTP_POST){zjAuthResetRequest();zjHttp.args.clear();zjHttp.headers.clear();zjHttp.path=route;zjHttp.verb=method;}
static String enroll(String kind,String credential,uint32_t delay=0){
 prepare("/api/auth/challenge");zjHttp.args["kind"]=kind;zjHttp.args["client"]=String(std::string(32,kind=="setup"?'a':'b'));zjHttp.handlers[zjHttp.path]();assert(replyStatus==200);
 const String nonce=zjChallenges[0].nonce,msg="enroll|"+zjKitId+"|"+zjBootId+"|"+nonce+"|"+kind+"|"+zjHttp.args["client"];
 clockMs+=delay;prepare("/api/auth/enroll");zjHttp.args["nonce"]=nonce;zjHttp.args["deviceId"]=zjKitId;zjHttp.args["proof"]=zjHmac(credential,msg);zjHttp.handlers[zjHttp.path]();return nonce;
}
int main(){
 // Exercise the production profile codec, five-entry bound, preference, removal,
 // legacy migration and failure preservation using an NVS double.
 zjSavedSsid="Legacy";zjSavedPass="password0";zjLoadProfiles();assert(zjWifiCount==1);
 for(int i=1;i<=6;i++)assert(zjRememberProfile(String("Router")+String(i),"password1"));
 assert(zjWifiCount==5&&zjSavedSsid=="Router6"&&zjWifiProfiles[4].ssid=="Router2");
 assert(zjSelectProfile("Router3")&&zjSavedSsid=="Router3");assert(!zjSelectProfile("Missing"));
 const String previous=zjPrefs.getString("profiles","");zjPrefs.failNextWrite=true;
 assert(!zjRememberProfile("Failed","password2"));assert(zjPrefs.getString("profiles","")==previous&&zjSavedSsid=="Router3");
 assert(zjForgetProfile("Router3")&&zjWifiCount==4&&zjSavedSsid=="Router6");
 const String publicProfiles=zjProfilesStatus();assert(std::string(publicProfiles.c_str()).find("password")==std::string::npos);
 zjSavedSsid="";zjSavedPass="";zjWifiCount=0;zjLoadProfiles();assert(zjWifiCount==4&&zjSavedSsid=="Router6");
 assert(zjRememberProfile("Open router",""));zjWifiCount=0;zjLoadProfiles();assert(zjSavedSsid=="Open router"&&zjSavedPass.isEmpty());
 zjKitId="ZFC-A1-012345ABCDEF";zjKitCode="123456";
 clockMs=1000;assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(192,168,4,2),"AP"));const String rcToken=zjRcSession;
 // A freshly claimed session accepts its FIRST frame, even though no RC timestamp exists.
 assert(zjRcFrame(1,1200,1510,1490,1520,"ANDROID",rcToken,true,IPAddress(192,168,4,2)));
 assert(!zjRcClaim("WEB",zjKitCode,false,IPAddress(),"USB"));
 clockMs=1100;assert(!zjRcFrame(1,1200,1500,1500,1500,"ANDROID",rcToken,true,IPAddress(192,168,4,2)));
 assert(!zjRcFrame(2,2001,1500,1500,1500,"ANDROID",rcToken,true,IPAddress(192,168,4,2)));
 assert(!zjRcFrame(2,1200,1500,1500,1500,"ANDROID",rcToken,true,IPAddress(192,168,4,3)));
 assert(zjRcFrame(2,1400,1500,1500,1500,"ANDROID",rcToken,true,IPAddress(192,168,4,2)));
 clockMs=1451;zjRcLoop(clockMs);assert(!zjRcHasFrame&&zjRcThrottle==1000&&zjRcOwned);assert(zjRcSeq==2);
 clockMs=2901;zjRcLoop(clockMs);assert(!zjRcOwned);assert(!zjRcFrame(3,1500,1500,1500,1500,"ANDROID",rcToken,true,IPAddress(192,168,4,2)));
 clockMs=0xfffffff0;assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(1),"AP"));assert(zjRcFrame(1,1300,1500,1500,1500,"ANDROID",zjRcSession,true,IPAddress(1)));
 clockMs=20;zjRcLoop(clockMs);assert(zjRcHasFrame);clockMs=400;zjRcLoop(clockMs);assert(!zjRcHasFrame);zjRcRelease("TEST");
 // Explicit input ARM requires low throttle and a fresh owner after failsafe.
 clockMs=5000;assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(1),"AP"));
 const String armedToken=zjRcSession;
 assert(!zjRcFrame(1,1200,1500,1500,1500,"ANDROID",armedToken,true,IPAddress(1),true));
 assert(zjRcFrame(1,1000,1500,1500,1500,"ANDROID",armedToken,true,IPAddress(1),true));
 assert(zjRcInputArmed);clockMs+=100;
 assert(zjRcFrame(2,1600,1700,1300,1800,"ANDROID",armedToken,true,IPAddress(1),true));
 assert(zjRcThrottle==1600&&zjRcRoll==1700&&zjRcPitch==1300&&zjRcYaw==1800);
 assert(std::string(zjRcState().c_str()).find("\"inputArmed\":true")!=std::string::npos);
 clockMs+=351;
 assert(!zjRcFrame(3,1000,1500,1500,1500,"ANDROID",armedToken,true,IPAddress(1),true));
 assert(!zjRcInputArmed&&!zjRcOwned&&zjRcThrottle==1000);
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(1),"AP"));
 assert(zjRcFrame(1,1000,1500,1500,1500,"ANDROID",zjRcSession,true,IPAddress(1),true));
 clockMs+=351;zjRcLoop(clockMs);assert(!zjRcInputArmed&&!zjRcOwned);
 // Enrollment is impossible without manufacturing installation of a strong label.
 clockMs=10000;zjEnrollmentInit();zjSetupEnrollmentHttp();prepare("/api/auth/challenge");zjHttp.args["kind"]="setup";zjHttp.args["client"]=String(std::string(32,'a'));zjHttp.handlers[zjHttp.path]();assert(replyStatus==409);
 zjPrefs.putString("label",String(std::string(64,'a')));zjEnrollmentInit();String nonce=enroll("setup",zjLabelSecret);assert(replyStatus==200);assert(zjSessions[0].setup);
 zjHttp.handlers["/api/auth/enroll"]();assert(replyStatus==401); // consumed challenge replay
 auto& session=zjSessions[0];prepare("/api/status",HTTP_GET);
 zjHttp.headers["X-ZJ-Device"]=zjKitId;zjHttp.headers["X-ZJ-Session"]=session.id;zjHttp.headers["X-ZJ-Seq"]="1";
 const String msg="GET|/api/status|"+zjKitId+"|"+zjBootId+"|"+session.id+"|1|";zjHttp.headers["X-ZJ-Proof"]=zjHmac(session.key,msg);
 assert(zjAllow()&&zjSetupAuthorized());zjAuthResetRequest();assert(!zjAllow()); // signed counter replay rejected
 clockMs=311000;zjRequestSession=0;assert(!zjSetupAuthorized());
 clockMs=312000;enroll("diagnostic",zjDiagnosticKey);assert(replyStatus==200&&!zjSessions[1].setup);
 // Repeated browser reloads reuse their own session slot, not all eight slots.
 for(int n=0;n<10;n++){clockMs+=400;enroll("diagnostic",zjDiagnosticKey);assert(replyStatus==200);}
 int live=0;for(const auto& s:zjSessions)if(!s.id.isEmpty())live++;assert(live==2);
 clockMs+=400;enroll("setup",zjLabelSecret,31000);assert(replyStatus==401); // stale challenge
 auto& diag=zjSessions[1];clockMs=diag.at+1800001;prepare("/api/status",HTTP_GET);
 zjHttp.headers["X-ZJ-Device"]=zjKitId;zjHttp.headers["X-ZJ-Session"]=diag.id;zjHttp.headers["X-ZJ-Seq"]="1";
 zjHttp.headers["X-ZJ-Proof"]=zjHmac(diag.key,"GET|/api/status|"+zjKitId+"|"+zjBootId+"|"+diag.id+"|1|");assert(!zjAllow());
 clockMs+=400;transport="STA";prepare("/api/auth/challenge");zjHttp.args["kind"]="setup";zjHttp.args["client"]=String(std::string(32,'a'));zjHttp.handlers[zjHttp.path]();assert(replyStatus==403);
 const String previousBoot=zjBootId;zjEnrollmentInit();assert(previousBoot!=zjBootId&&zjSessions[0].id.isEmpty());
 // Physical USB pairing can establish an encrypted admin session on STA even
 // without a manufacturer label. Public/local credentials cannot do so.
 zjPrefs.putString("label","");zjEnrollmentInit();clockMs+=1000;
 enroll("admin","wrong-private-key");assert(replyStatus==401);
 clockMs+=400;enroll("admin",zjNetKey);assert(replyStatus==200&&zjSessions[0].admin);
 // A stolen legacy raw bearer key must not grant ANY HTTP admin scope.
 // Only the proof derived through challenge/enroll can authorize OTA or reboot.
 for(const String path:{String("/api/status"),String("/api/reboot"),String("/api/firmware/begin")}){
  prepare(path,path=="/api/status"?HTTP_GET:HTTP_POST);
  zjHttp.headers["X-ZJ-Key"]=zjNetKey;
  zjHttp.headers["X-ZJ-Device"]=zjKitId;
  assert(!zjAllow()&&!zjAuthAdmin&&zjRequestSession<0);
  assert(!zjSetupAuthorized());
 }
 const auto admin=zjSessions[0];prepare("/api/status",HTTP_GET);
 zjHttp.headers["X-ZJ-Device"]=zjKitId;zjHttp.headers["X-ZJ-Session"]=admin.id;zjHttp.headers["X-ZJ-Seq"]="1";
 zjHttp.headers["X-ZJ-Proof"]=zjHmac(admin.key,"GET|/api/status|"+zjKitId+"|"+zjBootId+"|"+admin.id+"|1|");
 assert(zjAllow()&&zjAuthAdmin&&zjSetupAuthorized());
 zjAuthResetRequest();requestIP=IPAddress(192,168,4,99);assert(!zjAllow());requestIP=IPAddress(192,168,4,2);
 // Exercise real AES-256-GCM admin decryption for a 1024-byte encrypted
 // OTA chunk: never just bypass authentication in the large-payload test.
 const auto signedOtaPost=[&](const ZjSession& s,String route,uint32_t seq,const String& body,bool tamper=false){
  uint8_t keyBytes[32],iv[12]={0};zjUnhex(s.key,keyBytes);
  const std::string clear=body.c_str();
  std::vector<uint8_t> ciphertext(clear.size()+16);uint8_t tag[16];
  EVP_CIPHER_CTX* ctx=EVP_CIPHER_CTX_new();assert(ctx);
  int n=0,m=0;
  assert(EVP_EncryptInit_ex(ctx,EVP_aes_256_gcm(),nullptr,nullptr,nullptr)==1);
  assert(EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_GCM_SET_IVLEN,sizeof(iv),nullptr)==1);
  assert(EVP_EncryptInit_ex(ctx,nullptr,nullptr,keyBytes,iv)==1);
  assert(EVP_EncryptUpdate(ctx,ciphertext.data(),&n,reinterpret_cast<const uint8_t*>(clear.data()),int(clear.size()))==1);
  assert(EVP_EncryptFinal_ex(ctx,ciphertext.data()+n,&m)==1);
  assert(EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_GCM_GET_TAG,sizeof(tag),tag)==1);
  EVP_CIPHER_CTX_free(ctx);
  String payload=zjHexBytes(iv,sizeof(iv))+zjHexBytes(ciphertext.data(),n+m)+zjHexBytes(tag,sizeof(tag));
  prepare(route);zjHttp.headers["X-ZJ-Device"]=zjKitId;zjHttp.headers["X-ZJ-Session"]=s.id;
  zjHttp.headers["X-ZJ-Seq"]=String(seq);zjHttp.args["payload"]=payload;
  const String proofMsg="POST|"+route+"|"+zjKitId+"|"+zjBootId+"|"+s.id+"|"+String(seq)+"|"+payload;
  zjHttp.headers["X-ZJ-Proof"]=tamper?"invalid":zjHmac(s.key,proofMsg);
  return zjAllow();
 };
 const String largeChunkBody="offset=0&data="+String(std::string(4096,'a'));
 assert(signedOtaPost(admin,"/api/firmware/chunk",2,largeChunkBody)&&zjAuthAdmin);
 assert(zjArg("data").length()==4096&&zjArg("offset")=="0"); // 2048 bytes decoded intact
 assert(!signedOtaPost(admin,"/api/firmware/chunk",2,largeChunkBody)); // no replay
 assert(!signedOtaPost(admin,"/api/firmware/chunk",3,largeChunkBody,true)); // bad proof
 assert(!signedOtaPost(admin,"/api/firmware/chunk",3,"offset=0&data="+String(std::string(4500,'a')))); // bounded payload


 // Simple AP Wi-Fi setup works without BOOT, USB or manufacturer labels.
 zjPrefs.putString("label","");zjEnrollmentInit();transport="AP";clockMs+=1000;
 prepare("/api/auth/local");zjHttp.args["deviceId"]=zjKitId;zjHttp.args["client"]=String(std::string(32,'c'));zjHttp.handlers[zjHttp.path]();assert(replyStatus==200);
 const auto local=zjSessions[0];assert(local.local&&!local.setup&&local.key.length()==64);
 auto localRequest=[&](String path,int verb,uint32_t counter){prepare(path,verb);zjHttp.headers["X-ZJ-Device"]=zjKitId;zjHttp.headers["X-ZJ-Session"]=local.id;zjHttp.headers["X-ZJ-Seq"]=String(counter);zjHttp.headers["X-ZJ-Proof"]=zjHmac(local.key,String(verb==HTTP_GET?"GET":"POST")+"|"+path+"|"+zjKitId+"|"+zjBootId+"|"+local.id+"|"+String(counter)+"|");return zjAllow();};
 assert(localRequest("/api/status",HTTP_GET,1)&&zjSetupAuthorized()&&!zjAuthAdmin);
 assert(!localRequest("/api/status",HTTP_GET,1)); // replay
 assert(localRequest("/api/wifi/scan",HTTP_GET,2)&&zjSetupAuthorized());
 prepare("/api/wifi/test",HTTP_POST);assert(zjLocalDiagnosticRoute());
 prepare("/api/wifi/mode",HTTP_POST);assert(zjLocalDiagnosticRoute());
 prepare("/api/ota",HTTP_POST);assert(!zjLocalDiagnosticRoute());
 prepare("/api/admin",HTTP_GET);assert(!zjLocalDiagnosticRoute());
 assert(!localRequest("/api/ota",HTTP_POST,3));assert(!localRequest("/api/admin",HTTP_GET,3));
 transport="STA";assert(!localRequest("/api/status",HTTP_GET,3));
 prepare("/api/auth/local");zjHttp.args["deviceId"]=zjKitId;zjHttp.args["client"]=String(std::string(32,'d'));zjHttp.handlers[zjHttp.path]();
 assert(replyStatus==200&&zjSessions[1].localSta);
 const auto staSession=zjSessions[1];assert(!staSession.setup);
 auto staRequest=[&](String path,int verb,uint32_t counter){
  prepare(path,verb);
  zjHttp.headers["X-ZJ-Device"]=zjKitId;zjHttp.headers["X-ZJ-Session"]=staSession.id;
  zjHttp.headers["X-ZJ-Seq"]=String(counter);
  zjHttp.headers["X-ZJ-Proof"]=zjHmac(staSession.key,String(verb==HTTP_GET?"GET":"POST")+"|"+path+"|"+zjKitId+"|"+zjBootId+"|"+staSession.id+"|"+String(counter)+"|");
  return zjAllow();
 };
 assert(staRequest("/api/status",HTTP_GET,1)&&!zjSetupAuthorized());
 assert(!staRequest("/api/rc/claim",HTTP_POST,2));
 assert(!staRequest("/api/wifi/test",HTTP_POST,2));
 assert(!staRequest("/api/ota",HTTP_POST,2));
 assert(staRequest("/api/telemetry",HTTP_GET,2)&&!zjSetupAuthorized());
 transport="AP";requestIP=IPAddress(192,168,4,3);assert(!localRequest("/api/status",HTTP_GET,2));requestIP=IPAddress(192,168,4,2);assert(localRequest("/api/telemetry",HTTP_GET,3));
 clockMs=local.at+1800001;assert(!localRequest("/api/status",HTTP_GET,3));
 // AP-local traffic cannot exhaust every privileged session slot.
 zjEnrollmentInit();for(int i=0;i<5;i++){prepare("/api/auth/local");zjHttp.args["deviceId"]=zjKitId;zjHttp.args["client"]=String(std::string(32,'a'+i));zjHttp.handlers[zjHttp.path]();assert(replyStatus==(i<4?200:429));}assert(zjSessions[4].id.isEmpty());
 // Execute actual OTA handlers after a simulated auth layer (enrollment/proof
 // verification above). Diagnostic/observer scopes cannot begin a write.
 zjSetupSecureOtaHttp();
 auto ota=[&](String route,String body,bool admin=true){
  prepare(route);zjAuthChecked=true;zjRequestSession=0;zjAuthAdmin=admin;zjSessions[0].admin=admin;
  zjSessions[0].id="test-ota-admin";zjAuthBody=body;zjHttp.handlers[route]();
 };
 std::vector<uint8_t> app(32768,0x11);app[0]=0xe9;app[1]=2;app[12]=5;app[13]=0;
 app[32]=0x32;app[33]=0x54;app[34]=0xcd;app[35]=0xab;
 uint8_t digest[32];mbedtls_sha256(app.data(),app.size(),digest,0);
 const String hash=zjHexBytes(digest,32),begin="boardId=ZFC-A1&size=32768&sha256="+hash;
 ota("/api/firmware/begin",begin,false);assert(replyStatus==403&&!zjSecureOtaActive&&Update.written.empty());
 zjRcOwned=true;ota("/api/firmware/begin",begin);assert(replyStatus==409);zjRcOwned=false;
 ota("/api/firmware/begin",begin);assert(replyStatus==200&&zjSecureOtaActive);
 ota("/api/firmware/chunk","offset=1&data=00");assert(replyStatus==409&&Update.written.empty());
 // New receiver accepts 1024-byte chunks without disabling 384-byte clients.
 for(size_t at=0;at<app.size();at+=1024){const size_t n=std::min(size_t(1024),app.size()-at);ota("/api/firmware/chunk","offset="+String(at)+"&data="+zjHexBytes(app.data()+at,n));assert(replyStatus==200);}
 assert(Update.written==app&&!Update.activated);ota("/api/firmware/end","");assert(replyStatus==200&&Update.activated&&!zjSecureOtaActive&&zjOtaRebootAt);
 zjOtaRebootAt=0;ota("/api/firmware/begin","boardId=ZFC-A1&size=32768&sha256="+String(std::string(64,'0')));assert(replyStatus==200);
 for(size_t at=0;at<app.size();at+=384){const size_t n=std::min(size_t(384),app.size()-at);ota("/api/firmware/chunk","offset="+String(at)+"&data="+zjHexBytes(app.data()+at,n));}
 ota("/api/firmware/end","");assert(replyStatus==400&&!Update.activated&&!zjSecureOtaActive);
 ota("/api/firmware/begin",begin);
 ota("/api/firmware/chunk","offset=0&data="+String(std::string(4100,'a')));
 assert(replyStatus==409&&Update.written.empty()); // oversized OTA never reaches the flash writer
 clockMs+=30001;zjSecureOtaLoop(clockMs);assert(!zjSecureOtaActive&&!Update.activated);
 std::cout<<"PASS actual firmware headers: RC first frame, exclusivity, replay, bounds, IP binding, deadman, lease, rollover; enrollment scope, counter replay, expiry, reboot revocation\n";
}
