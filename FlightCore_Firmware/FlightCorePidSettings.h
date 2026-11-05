#pragma once
#include "FlightCoreRatePid.h"
#include "FlightCorePidProfiles.h"
#include "FlightCoreSettingsChecksum.h"
#include <Preferences.h>

// A verified marker binds the committed slot and revision to its verified
// predecessor. A staged slot, including one with a valid checksum, is not a commit.
static const char* const ZJ_PID_KEYS[]={"pidBank20","pidBank21"};
static constexpr const char* ZJ_PID_HEAD="pidCommit2";
struct ZjPidSettings {
 uint32_t revision=0;
 uint32_t gains[ZJ_PID_GAIN_COUNT];
 uint8_t profile=0;
 String requestId;
 bool persisted=false;

 explicit ZjPidSettings(uint8_t selected=0):profile(selected){
  std::copy_n(ZJ_PID_PROFILES[profile].gains,ZJ_PID_GAIN_COUNT,gains);
 }
 ZjRateGains axis(unsigned n)const{return {gains[n*3]/1000.0f,gains[n*3+1]/1000.0f,gains[n*3+2]/1000.0f};}
};
struct ZjPidHead {uint32_t revision=0,previous=0;uint8_t slot=0;};
static ZjPidSettings zjPidSettings,zjPidActive;
static ZjPidHead zjPidHead;
static String zjPidVerifiedHead;
static int zjPidLoadedSlot=-1;
static uint32_t zjPidGeneration=1;
static bool zjPidPreview=false,zjPidStorageCorrupt=false,zjPidStorageUncertain=false;

static void zjPidActivate(const ZjPidSettings& config,bool preview){
 zjPidActive=config;zjPidPreview=preview;
 if(!++zjPidGeneration)++zjPidGeneration;
}
static void zjPidResetState(){
 zjPidSettings=ZjPidSettings{};zjPidActivate(zjPidSettings,false);
 zjPidHead={};zjPidVerifiedHead="";zjPidLoadedSlot=-1;
 zjPidStorageCorrupt=zjPidStorageUncertain=false;
}
static int zjPidProfileIndex(const String& id){
 for(unsigned i=0;i<ZJ_PID_PROFILE_COUNT;i++)if(id==ZJ_PID_PROFILES[i].id)return i;
 return -1;
}
static bool zjPidUnsigned(const String& text,uint32_t max,uint32_t& result){
 if(!text.length()||text.length()>10)return false;
 uint64_t value=0;
 for(size_t i=0;i<text.length();++i){
  if(text[i]<'0'||text[i]>'9')return false;
  value=value*10+unsigned(text[i]-'0');
 }
 if(value>max)return false;
 result=uint32_t(value);return true;
}
static bool zjPidToken(const String& token){
 if(token.length()<1||token.length()>24)return false;
 for(size_t i=0;i<token.length();i++)if(!isalnum(static_cast<unsigned char>(token[i])))return false;
 return true;
}
static bool zjPidParseGains(const String& encoded,ZjPidSettings& config,unsigned count=ZJ_PID_GAIN_COUNT){
 int at=0;
 for(unsigned n=0;n<count;n++){
  const int sep=encoded.indexOf('|',at);
  if((n+1<count)!=(sep>=0)||!zjPidUnsigned(encoded.substring(at,sep<0?encoded.length():sep),100000,config.gains[n]))return false;
  at=sep+1;
 }
 return true;
}
static String zjPidRecord(const ZjPidSettings& config){
 String body=String("2;")+String(config.revision)+";"+config.requestId+";"+ZJ_PID_PROFILES[config.profile].id+";";
 for(unsigned n=0;n<ZJ_PID_GAIN_COUNT;n++){if(n)body+='|';body+=String(config.gains[n]);}
 return body+";"+String(zjSettingsChecksum(body));
}
static bool zjPidDecode(const String& record,ZjPidSettings& config,bool legacy=false){
 const int revisionEnd=record.indexOf(';',2),tokenEnd=record.indexOf(';',revisionEnd+1);
 if(record.substring(0,2)!=(legacy?"1;":"2;")||revisionEnd<3||tokenEnd<=revisionEnd)return false;
 const int gainsStart=legacy?tokenEnd:record.indexOf(';',tokenEnd+1);
 if(gainsStart<tokenEnd)return false;
 const int checksumStart=record.indexOf(';',gainsStart+1);
 const int profile=legacy?0:zjPidProfileIndex(record.substring(tokenEnd+1,gainsStart));
 if(checksumStart<=gainsStart||profile<0||
    record.substring(checksumStart+1)!=String(zjSettingsChecksum(record.substring(0,checksumStart))))return false;
 ZjPidSettings decoded(profile);
 decoded.requestId=record.substring(revisionEnd+1,tokenEnd);
 if(!zjPidToken(decoded.requestId)||
    !zjPidUnsigned(record.substring(2,revisionEnd),UINT32_MAX,decoded.revision)||!decoded.revision||
    !zjPidParseGains(record.substring(gainsStart+1,checksumStart),decoded,legacy?ZJ_PID_RATE_GAIN_COUNT:ZJ_PID_GAIN_COUNT))return false;
 decoded.persisted=true;config=decoded;return true;
}
static String zjPidEncodeHead(const ZjPidHead& head){
 const String body=String(head.slot)+";"+String(head.revision)+";"+String(head.previous);
 return body+";"+String(zjSettingsChecksum(body));
}
static bool zjPidDecodeHead(const String& record,ZjPidHead& head){
 const int end=record.indexOf(';',2),checksumAt=record.indexOf(';',end+1);
 if(end<=2||checksumAt<=end||record[1]!=';'||(record[0]!='0'&&record[0]!='1')||
    record.substring(checksumAt+1)!=String(zjSettingsChecksum(record.substring(0,checksumAt)))||
    !zjPidUnsigned(record.substring(2,end),UINT32_MAX,head.revision)||!head.revision||
    !zjPidUnsigned(record.substring(end+1,checksumAt),head.revision-1,head.previous))return false;
 head.slot=uint8_t(record[0]-'0');return true;
}
static bool zjPidLoad(Preferences& prefs){
 zjPidResetState();
 const String marker=prefs.getString(ZJ_PID_HEAD,"");
 ZjPidSettings loaded;
 if(marker.isEmpty()){
  // Keep the schema-1 keys intact so an earlier APP can still read them.
  const String legacy=prefs.getString("pidActive","");
  if(legacy.isEmpty())return true;
  if((legacy!="0"&&legacy!="1")||
     !zjPidDecode(prefs.getString(legacy=="1"?"pidGains1":"pidGains0",""),loaded,true)){
   zjPidStorageCorrupt=true;return false;
  }
 }else{
  if(!zjPidDecodeHead(marker,zjPidHead)){zjPidStorageCorrupt=true;return false;}
  const auto slot=zjPidHead.slot;
  if(zjPidDecode(prefs.getString(ZJ_PID_KEYS[slot],""),loaded)&&loaded.revision==zjPidHead.revision)
   zjPidLoadedSlot=slot;
  else if(zjPidHead.previous&&zjPidDecode(prefs.getString(ZJ_PID_KEYS[slot^1],""),loaded)&&loaded.revision==zjPidHead.previous)
   zjPidLoadedSlot=slot^1;
  else{zjPidStorageCorrupt=true;return false;}
  zjPidVerifiedHead=marker;
 }
 zjPidSettings=loaded;zjPidActivate(loaded,false);return true;
}
static bool zjPidSame(const ZjPidSettings& a,const ZjPidSettings& b){
 return a.profile==b.profile&&std::equal(a.gains,a.gains+ZJ_PID_GAIN_COUNT,b.gains);
}
static bool zjPidStage(Preferences& prefs,unsigned slot,const ZjPidSettings& config){
 const String record=zjPidRecord(config);
 ZjPidSettings decoded;
 return prefs.putString(ZJ_PID_KEYS[slot],record)==record.length()&&
  prefs.getString(ZJ_PID_KEYS[slot],"")==record&&zjPidDecode(record,decoded);
}
static const char* zjPidCommit(Preferences& prefs,const ZjPidHead& head){
 const String next=zjPidEncodeHead(head);
 const auto readIs=[&](const String& expected){
  return prefs.getString(ZJ_PID_HEAD,"")==expected||prefs.getString(ZJ_PID_HEAD,"")==expected;
 };
 const bool written=prefs.putString(ZJ_PID_HEAD,next)==next.length();
 if(readIs(next)){zjPidHead=head;zjPidVerifiedHead=next;return nullptr;}
 if(!written&&readIs(zjPidVerifiedHead))return "STORAGE_FAILED";
 // A failed acknowledgement is definitive only after the old marker is verified.
 if(zjPidVerifiedHead.isEmpty())prefs.remove(ZJ_PID_HEAD);
 else prefs.putString(ZJ_PID_HEAD,zjPidVerifiedHead);
 if(readIs(zjPidVerifiedHead))return "STORAGE_FAILED";
 zjPidStorageUncertain=true;return "STORAGE_UNCERTAIN";
}
static const char* zjPidSave(Preferences& prefs,ZjPidSettings next,uint32_t expected){
 if(zjPidStorageUncertain)return "STORAGE_UNCERTAIN";
 if(zjPidStorageCorrupt)return "STORAGE_CORRUPT";
 if(zjPidSettings.persisted&&next.requestId==zjPidSettings.requestId)
  return zjPidSame(next,zjPidSettings)&&expected==zjPidSettings.revision-1?nullptr:"REQUEST_ID_REUSED";
 if(expected!=zjPidSettings.revision||expected==UINT32_MAX)return "REVISION_CONFLICT";
 if(zjPidSettings.persisted&&(zjPidLoadedSlot<0||zjPidLoadedSlot!=zjPidHead.slot)){
  // Migrate a readable legacy commit, or restore the verified backup marker
  // before reusing a corrupt active slot. A staged next revision cannot match it.
  const uint8_t slot=zjPidLoadedSlot<0?0:zjPidLoadedSlot;
  if(zjPidLoadedSlot<0&&!zjPidStage(prefs,slot,zjPidSettings))return "STORAGE_FAILED";
  if(const auto error=zjPidCommit(prefs,{zjPidSettings.revision,0,slot}))return error;
  zjPidLoadedSlot=slot;
 }
 const uint8_t slot=zjPidLoadedSlot<0?0:zjPidLoadedSlot^1;
 next.revision=expected+1;next.persisted=true;
 if(!zjPidStage(prefs,slot,next))return "STORAGE_FAILED";
 if(const auto error=zjPidCommit(prefs,{next.revision,expected,slot}))return error;
 zjPidLoadedSlot=slot;zjPidSettings=next;zjPidActivate(next,false);return nullptr;
}
static bool zjPidSupported(){return String(FC_BOARD)=="ZFC-A2";}
