#include "host-stubs/ArduinoShim.h"
#include "../FlightCore_Firmware/FlightCorePidSettings.h"
#include "../FlightCore_Firmware/FlightCoreTiming.h"
#include <cassert>
#include <iostream>
#include <limits>

int main(){
 Preferences prefs;
 assert(zjPidLoad(prefs)&&!zjPidSettings.persisted);
 ZjPidSettings next;
 assert(zjPidParseGains("1750|20000|55|1400|18000|35|3000|20000|0|3200|300|20|3000|0|0",next));
 next.requestId="first";
 assert(!zjPidSave(prefs,next,0));
 assert(zjPidSettings.revision==1&&zjPidSettings.gains[0]==1750);
 const auto writes=prefs.writes;
 assert(!zjPidSave(prefs,next,0)&&prefs.writes==writes);
 next.gains[0]=1000;
 assert(String(zjPidSave(prefs,next,0))=="REQUEST_ID_REUSED");
 next.requestId="second";
 assert(String(zjPidSave(prefs,next,0))=="REVISION_CONFLICT");
 prefs.failNextWrite=true;
 assert(String(zjPidSave(prefs,next,1))=="STORAGE_FAILED");
 assert(zjPidSettings.gains[0]==1750&&zjPidLoad(prefs)&&zjPidSettings.gains[0]==1750);
 // Model a power cut after staging the next slot, before committing the selector.
 next.revision=2;
 prefs.putString(ZJ_PID_KEYS[1],zjPidRecord(next));
 assert(zjPidLoad(prefs)&&zjPidSettings.revision==1);
 prefs.failWriteAt=prefs.writes+2;
 assert(String(zjPidSave(prefs,next,1))=="STORAGE_FAILED");
 assert(zjPidLoad(prefs)&&zjPidSettings.revision==1);
 prefs.mismatchKey=ZJ_PID_HEAD;prefs.mismatchAfterWrite=prefs.writes+2;
 assert(!zjPidSave(prefs,next,1)&&zjPidLoad(prefs)&&zjPidSettings.gains[0]==1000);
 assert(zjPidSettings.gains[9]==3200&&zjPidActive.gains[9]==3200);
 auto corrupt=zjPidRecord(next)+"0";
 ZjPidSettings parsed;
 assert(!zjPidDecode(corrupt,parsed));
 assert(!zjPidParseGains("1|2|3|4|5|6|7|8|100001",parsed,ZJ_PID_RATE_GAIN_COUNT));
 prefs.putString(ZJ_PID_KEYS[1],corrupt);
 assert(zjPidLoad(prefs)&&zjPidSettings.revision==1&&zjPidSettings.gains[0]==1750);
 // During a save from a recovered slot, a failed new commit must preserve
 // the repaired backup pointer and must never accept the staged revision.
 prefs.failWriteAt=prefs.writes+3;
 assert(String(zjPidSave(prefs,next,1))=="STORAGE_FAILED");
 assert(zjPidLoad(prefs)&&zjPidSettings.revision==1&&zjPidSettings.gains[0]==1750);
 assert(!zjPidSave(prefs,next,1)&&zjPidLoad(prefs)&&zjPidSettings.revision==2);
 auto live=zjPidSettings;live.gains[9]=2900;
 const auto savedWrites=prefs.writes;const auto generation=zjPidGeneration;
 zjPidActivate(live,true);
 assert(zjPidPreview&&zjPidActive.gains[9]==2900&&zjPidSettings.gains[9]==3200);
 assert(prefs.writes==savedWrites&&zjPidGeneration!=generation);
 assert(zjPidLoad(prefs)&&!zjPidPreview&&zjPidActive.gains[9]==3200);
 prefs.clear();
 const String legacy="1;3;legacy;1750|20000|55|1400|18000|35|3000|20000|0";
 prefs.putString("pidGains0",legacy+";"+String(zjSettingsChecksum(legacy)));
 prefs.putString("pidActive","0");
 assert(zjPidLoad(prefs)&&zjPidSettings.revision==3&&zjPidSettings.gains[0]==1750&&zjPidSettings.gains[9]==3000);
 ZjPidSettings plus(1);plus.requestId="plus";
 assert(!zjPidSave(prefs,plus,3)&&zjPidLoad(prefs)&&zjPidSettings.profile==1&&zjPidSettings.revision==4);
 assert(prefs.getString("pidActive")=="0");
 prefs.clear();assert(zjPidLoad(prefs)&&!zjPidSettings.persisted&&zjPidSettings.gains[0]==900);

 ZjRatePidState state;
 const ZjRateGains gains=ZjPidSettings().axis(0);
 const float vectors[][4]={{20,0,.004,0},{20,2,.004,0},{-20,2,.005,0},{-20,-2,.004,-5},
  {500,0,.004,0},{0,0,.120629f,0},{-15,0,.004,0}};
 for(const auto& v:vectors){
  const auto r=zjStepRatePid(state,gains,v[0],v[1],v[2],v[3]);
  std::cout<<r.valid<<' '<<r.output<<' '<<r.i<<' '<<r.d<<' '<<r.saturated<<'\n';
 }
 assert(!zjStepRatePid(state,{std::numeric_limits<float>::infinity(),0,0},10,0,.004).valid);
 const auto plusMix=zjRateMixQuadPlus(1500,100,20,10);
 assert(plusMix.pulse[0]==1470&&plusMix.pulse[1]==1610&&plusMix.pulse[2]==1510&&plusMix.pulse[3]==1410);
 float bench[2]={};
 assert(zjBenchAngles(0,.5f,.8660254f,bench)&&std::fabs(bench[0]-30)<.01&&bench[1]==0);
 assert(!zjBenchAngles(0,0,2,bench)&&!zjBenchAngles(0,0,-1,bench));
 ZjAnglePidState outer;
 assert(zjStepAnglePid(outer,{3,0,0},10,0,.004f)==30);
 const auto mix=zjRateMixQuadX(1500,100,20,10);
 assert(mix.pulse[0]==1370&&mix.pulse[1]==1590&&mix.pulse[2]==1610&&mix.pulse[3]==1430);
 assert(zjRateMixQuadX(1950,300,0,0).residual[0]>0);
 ZjControlScheduler control;
 control.start(0);assert(control.begin(4000));control.finish(4200);
 assert(control.begin(124629));assert(control.maxIntervalUs==120629&&control.maxIntervalAtUs==124629&&control.missedTicks>0);
}
