// Exercises the ACTUAL firmware RC and enrollment headers with fake time/HTTP.
// OpenSSL supplies the host crypto primitives; board compilation uses mbedTLS.
#include "host-stubs/ArduinoShim.h"
#include <cassert>
#include <iostream>
#include "../FlightCore_Firmware/FlightCoreClassroom.h"
const int HTTP_GET=1,HTTP_POST=2;
struct FakeHttp {
 std::map<String,String> headers,args;std::map<String,std::function<void()>> handlers;String path;int verb=HTTP_GET;
 String arg(String n){return args[n];}String header(String n){return headers[n];}String uri(){return path;}int method(){return verb;}
 struct Client {IPAddress remoteIP(){return IPAddress(192,168,4,2);}};Client client(){return {};}
 template<class F>void on(String p,int,F f){handlers[p]=f;}
} zjHttp;
static Preferences zjPrefs;static String zjNetKey="ff112233445566778899aabbccddeeff0";
static String zjJson(const String& v){return String("\"")+v+"\"";}
static String zjNewSecret(size_t n){String out;for(size_t i=0;i<n;i++){char b[3];snprintf(b,3,"%02x",esp_random()%256);out+=b;}return out;}
static String transport="AP",replyBody;static int replyStatus=0;
static const char* zjClientTransport(){return transport.c_str();}
static void zjReply(int status,const String& body){replyStatus=status;replyBody=body;}
static bool zjAllow();
#include "../FlightCore_Firmware/FlightCoreEnrollment.h"
static bool zjAllow(){return zjSessionAuthenticated();}
static void prepare(String route,int method=HTTP_POST){zjAuthResetRequest();zjHttp.args.clear();zjHttp.headers.clear();zjHttp.path=route;zjHttp.verb=method;}
static String enroll(String kind,String credential){
 prepare("/api/auth/challenge");zjHttp.args["kind"]=kind;zjHttp.args["client"]=String(std::string(32,kind=="setup"?'a':'b'));zjHttp.handlers[zjHttp.path]();assert(replyStatus==200);
 const String nonce=zjChallenges[0].nonce,msg="enroll|"+zjKitId+"|"+zjBootId+"|"+nonce+"|"+kind+"|"+zjHttp.args["client"];
 prepare("/api/auth/enroll");zjHttp.args["nonce"]=nonce;zjHttp.args["deviceId"]=zjKitId;zjHttp.args["proof"]=zjHmac(credential,msg);zjHttp.handlers[zjHttp.path]();return nonce;
}
int main(){
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
 clockMs+=400;transport="STA";prepare("/api/auth/challenge");zjHttp.args["kind"]="setup";zjHttp.args["client"]=String(std::string(32,'a'));zjHttp.handlers[zjHttp.path]();assert(replyStatus==403);
 const String previousBoot=zjBootId;zjEnrollmentInit();assert(previousBoot!=zjBootId&&zjSessions[0].id.isEmpty());
 std::cout<<"PASS actual firmware headers: RC first frame, exclusivity, replay, bounds, IP binding, deadman, lease, rollover; enrollment scope, counter replay, expiry, reboot revocation\n";
}
