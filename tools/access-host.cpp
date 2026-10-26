// Real RC/PPM/access functions, fixed-time clock and physical input doubles.
#define main ppm_regression_main
#include "ppm-host.cpp"
#undef main
#include "../FlightCore_Firmware/FlightCoreAccess.h"
static void errorIs(const char* actual,const char* expected){
 if(!actual||std::string(actual)!=expected)std::cerr<<"Expected "<<expected<<"; got "<<(actual?actual:"accepted")<<std::endl;
 assert(actual&&std::string(actual)==expected);
}
int main(){
 ppm_regression_main();
 frame(1000); // physical receiver ARM switch must also be low before handover
 const String token=zjRcSession;
 errorIs(zjAccessChange("BEGIN","","",false,true),"authorization_required");
 errorIs(zjAccessChange("BEGIN","","browser-a",false,true),"rc_owned_by_other_controller");
 assert(zjRcFrame(1,1000,1500,1500,1500,"ANDROID",token,true,IPAddress(192,168,4,2),true));
 errorIs(zjAccessChange("BEGIN","","browser-a",true,true),"lower_throttle_and_disarm");
 assert(zjRcFrame(2,1600,1500,1500,1500,"ANDROID",token,true,IPAddress(192,168,4,2),false));
 errorIs(zjAccessChange("BEGIN","","browser-a",true,true),"lower_throttle_and_disarm");
 assert(zjRcFrame(3,1000,1500,1500,1500,"ANDROID",token,true,IPAddress(192,168,4,2),false));
 errorIs(zjAccessChange("BEGIN","","browser-a",true,false),"fresh_stationary_imu_required");
 assert(!zjAccessChange("BEGIN","","browser-a",true,true));
 assert(zjRcPaused&&zjMaintenanceActive&&!zjRcOwned&&!zjRcInputArmed&&zjRcThrottle==1000);
 assert(!zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"STA"));
 assert(!zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"STA"));
 const uint32_t accepted=zjRcAccepted;
 frame(1000,true,1800);frame(1000);frame(1000);
 assert(zjPpmSignalFresh(clockMs)&&zjPpmRaw[0]==1500&&!zjRcOwned&&zjRcAccepted==accepted);
 errorIs(zjAccessChange("KEEP","","browser-b",false,true),"not_maintenance_owner");
 errorIs(zjAccessChange("RESUME","WEB","browser-b",false,true),"maintenance_owned_by_other_session");
 assert(!zjAccessChange("KEEP","","browser-a",false,true));
 assert(zjRcLeaseAt==0&&!zjRcOwned); // maintenance keepalive is not an RC keepalive
 assert(std::string(zjAccessState("browser-b",true).c_str()).find("\"owned\":false")!=std::string::npos);
 waitMs(30001);zjAccessLoop();
 assert(zjRcPaused&&zjMaintenanceActive&&zjMaintenanceOwner.isEmpty()&&!zjRcOwned);
 errorIs(zjAccessChange("RESUME","PPM","browser-b",false,true),"ppm_signal_required");
 frame(2000);frame(2000);errorIs(zjAccessChange("RESUME","PPM","browser-b",false,true),"lower_throttle_and_disarm");
 frame(1000,true,1500,1800);errorIs(zjAccessChange("RESUME","WEB","browser-b",false,true),"lower_throttle_and_disarm");
 frame(1000);assert(!zjAccessChange("RESUME","PPM","browser-b",false,true));
 assert(!zjRcOwned&&!zjRcInputArmed&&!zjRcPaused&&zjRcSelection=="PPM");
 frame(2000);assert(!zjRcOwned);frame(1000);frame(1000);assert(!zjRcOwned);frame(1000);
 assert(zjRcOwned&&zjRcSource=="PPM"&&!zjRcInputArmed);
 assert(!zjAccessChange("SELECT","WEB","browser-b",false,true));
 frame(1000);frame(1000);frame(1000);assert(!zjRcOwned);
 assert(zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"STA"));
 errorIs(zjAccessChange("SELECT","ANDROID","other",false,true),"rc_owned_by_other_controller");
 assert(!zjAccessChange("SELECT","ANDROID","browser-b",true,true));
 assert(!zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"STA"));
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"STA"));
 errorIs(zjAccessChange("SELECT","INVALID","browser-b",true,true),"invalid_rc_source");
 assert(zjRcSource=="ANDROID"&&zjRcOwned);
 zjRcRelease("TEST_STOP");frame(1000);frame(1000);frame(1000);assert(!zjRcOwned);
 // USB writes retain teacher authorization and exact physical Device ID checks.
 char locked[]="ZJACCESS,BEGIN,ZFC-A1-012345ABCDEF,test-1";
 zjAdminUnlocked=false;zjAccessSerialCommand(locked,true,false);assert(!zjMaintenanceActive);
 zjAdminUnlocked=true;zjAdminUnlockAt=millis();
 char busy[]="ZJACCESS,BEGIN,ZFC-A1-012345ABCDEF,test-2";
 zjAccessSerialCommand(busy,true,true);assert(!zjMaintenanceActive);
 char wrong[]="ZJACCESS,BEGIN,ZFC-A2-FFFFFFFFFFFF,test-3";
 zjAccessSerialCommand(wrong,true,false);assert(!zjMaintenanceActive);
 char begin[]="ZJACCESS,BEGIN,ZFC-A1-012345ABCDEF,test-4";
 zjAccessSerialCommand(begin,true,false);assert(zjMaintenanceActive&&zjRcPaused);
 // Four control paths are target-specific and enforced below the UI.
 assert(!zjAccessChange("RESUME","PPM","USB",false,true,"PPM","AP"));
 frame(1000);frame(1000);frame(1000);
 assert(zjRcOwned&&zjRcSource=="PPM"&&zjAccessCanSwitchRadio());
 const auto ppmSeq=zjRcSeq;
 assert(zjAccessCanSwitchRadio()&&zjRcSeq==ppmSeq&&zjRcOwned);
 frame(2000);assert(!zjAccessCanSwitchRadio());frame(1000);
 errorIs(zjAccessChange("SELECT","ANDROID","USB",false,true,"ANDROID_AP","STA"),"control_path_requires_matching_wifi");
 assert(zjRcSource=="PPM"&&zjRcControlPath=="PPM");
 assert(!zjAccessChange("SELECT","ANDROID","USB",false,true,"ANDROID_AP","AP"));
 assert(!zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"STA"));
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"AP"));zjRcRelease("TEST_STOP");
 assert(!zjAccessChange("SELECT","ANDROID","USB",false,true,"ANDROID_WEBRTC","STA"));
 assert(!zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"STA"));
 assert(!zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"AP"));
 assert(!zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"STA"));
 assert(!zjAccessChange("SELECT","WEB","USB",false,true,"WEB_STA","STA"));
 assert(!zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"AP"));
 assert(zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"STA"));zjRcRelease("TEST_STOP");
 assert(!zjAccessChange("SELECT","PPM","USB",false,true,"PPM","STA"));
 frame(1000);frame(1000);frame(1000);assert(zjRcOwned&&zjRcSource=="PPM");
 waitMs(151);zjPpmLoop(clockMs);assert(!zjRcOwned&&!zjRcHasFrame);
 assert(!zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"STA"));
 std::cout<<"PASS production RC access: safe handover, maintenance, authorization, lease expiry and explicit resume"<<std::endl;
}
