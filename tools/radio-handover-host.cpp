// Execute the real PPM/RC/access/profile code with physical input and NVS doubles.
#define main ppm_regression_main
#include "ppm-host.cpp"
#undef main
#include "../FlightCore_Firmware/FlightCoreAccess.h"
static Preferences zjPrefs;
static String zjMode="sta",zjSavedSsid="School";
#include "../FlightCore_Firmware/FlightCoreHandover.h"
static void errorIs(const char* actual,const char* expected){assert(actual&&std::string(actual)==expected);}
int main(){
 ppm_regression_main();zjRcRelease("TEST");zjRcPaused=false;zjRcSelection="AUTO";zjRcControlPath="AUTO";
 frame(1000);frame(1000);frame(1000);assert(zjRcOwned&&zjRcSource=="PPM");
 const auto accepted=zjRcAccepted;zjPrefs.failNextWrite=true;
 errorIs(zjPrepareRadioHandover("ap","STA"),"input_profile_save_failed");
 assert(zjRcOwned&&zjRcSource=="PPM"&&!zjRcPaused&&zjMode=="sta");
 frame(1800);errorIs(zjPrepareRadioHandover("ap","STA"),"lower_throttle_and_disarm");
 frame(1000,true,1500,1800);errorIs(zjPrepareRadioHandover("ap","STA"),"lower_throttle_and_disarm");
 frame(1000);assert(!zjPrepareRadioHandover("ap","STA"));
 assert(zjPrefs.getString("inputProfile","")=="1|ap|ANDROID_AP|PPM|1");
 assert(zjHandoverSaved&&zjHandoverPending&&zjRcPaused&&!zjRcOwned&&!zjRcInputArmed);
 errorIs(zjAccessChange("SELECT","WEB","another-client",false,true,"WEB_STA","STA"),"radio_handover_pending");
 assert(zjRcControlPath=="ANDROID_AP"&&zjLastStaInput=="PPM");
 frame(1000);frame(1000);frame(1000);assert(!zjRcOwned&&zjRcAccepted==accepted+3);
 errorIs(zjPrepareRadioHandover("sta","STA"),"handover_busy");
 // An ARM switch raised after ACK cancels application; input remains paused.
 frame(1000,true,1500,1800);assert(!zjRadioHandoverMayApply());
 assert(!zjHandoverPending&&zjHandoverState=="FAILED"&&zjRcPaused&&!zjRcOwned);
 frame(1000);assert(!zjPrepareRadioHandover("ap","STA"));assert(zjRadioHandoverMayApply());
 zjRadioHandoverApplied("AP");assert(!zjRcPaused&&!zjHandoverPending&&!zjRcOwned);
 frame(1000);frame(1000);frame(1000);assert(!zjRcOwned); // PPM cannot reclaim AP.
 assert(!zjRcClaim("WEB",zjKitCode,true,IPAddress(2),"STA"));
 assert(zjRcClaim("ANDROID",zjKitCode,true,IPAddress(2),"AP"));
 errorIs(zjPrepareRadioHandover("sta","AP"),"release_current_controller_first");
 zjRcRelease("TEST");assert(!zjPrepareRadioHandover("sta","AP"));
 assert(zjRcControlPath=="PPM"&&zjRcPaused&&zjMode=="sta");
 zjRadioHandoverApplied("STA");assert(!zjRcPaused&&!zjRcInputArmed&&!zjRcOwned);
 frame(1000);frame(1000);frame(1000);assert(zjRcOwned&&zjRcSource=="PPM"&&!zjRcInputArmed);
 // A reboot restores the combined profile, never the old session/ARM.
 zjRcRelease("BOOT");zjRcControlPath="AUTO";zjRcSelection="AUTO";zjMode="auto";zjLoadRadioProfile();
 assert(zjMode=="sta"&&zjRcControlPath=="PPM"&&!zjRcOwned&&!zjRcInputArmed);
 zjSavedSsid="";errorIs(zjPrepareRadioHandover("sta","AP"),"save_sta_credentials_first");zjSavedSsid="School";
 assert(!zjPrepareRadioHandover("ap","STA"));zjRadioHandoverFailed("AP_START_FAILED");
 assert(zjRcPaused&&!zjHandoverPending&&zjHandoverState=="FAILED");
 zjPrefs.putString("inputProfile","1|ap|WEB_STA|PPM|1");zjRcControlPath="AUTO";zjMode="auto";zjLoadRadioProfile();
 assert(zjMode=="auto"&&zjRcControlPath=="AUTO");
 std::cout<<"PASS production coordinated handover: atomic save, failure preservation, safe PPM, ARM race, explicit claim, STA restore, reboot and corrupt profile\n";
}
