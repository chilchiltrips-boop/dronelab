#pragma once
#include "FlightCoreRatePid.h"
#include "FlightCoreSettingsChecksum.h"
#include <Preferences.h>

// Wire/storage gain units are integer thousandths. The active pointer is the
// only commit point. An interrupted staging write never becomes authoritative.
static const char* const ZJ_PID_KEYS[]={"pidGains0","pidGains1"};
static const char* const ZJ_PID_AXES[]={"rateRoll","ratePitch","rateYaw"};
struct ZjPidSettings {
 uint32_t revision=0;
 uint32_t gains[9]={1400,18000,35,1400,18000,35,3000,20000,0};
 String requestId;
 bool persisted=false;
 ZjRateGains axis(unsigned n)const{return {gains[n*3]/1000.0f,gains[n*3+1]/1000.0f,gains[n*3+2]/1000.0f};}
};
static ZjPidSettings zjPidSettings;
static bool zjPidSupported(){return String(FC_BOARD)=="ZFC-A2";}

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
static bool zjPidParseGains(const String& encoded,ZjPidSettings& config){
 int at=0;
 for(unsigned n=0;n<9;n++){
  const int sep=encoded.indexOf('|',at);
  if((n<8)!=(sep>=0)||!zjPidUnsigned(encoded.substring(at,sep<0?encoded.length():sep),100000,config.gains[n]))return false;
  at=sep+1;
 }
 return true;
}
static String zjPidEncodeGains(const ZjPidSettings& config){
 String out="";
 for(unsigned n=0;n<9;n++){if(n)out+='|';out+=String(config.gains[n]);}
 return out;
}
static String zjPidRecord(const ZjPidSettings& config){
 const String body=String("1;")+String(config.revision)+";"+config.requestId+";"+zjPidEncodeGains(config);
 return body+";"+String(zjSettingsChecksum(body));
}
static bool zjPidDecode(const String& record,ZjPidSettings& config){
 const int revisionEnd=record.indexOf(';',2),tokenEnd=record.indexOf(';',revisionEnd+1),checksumStart=record.indexOf(';',tokenEnd+1);
 uint32_t checksum=0;
 if(record.substring(0,2)!="1;"||revisionEnd<3||tokenEnd<=revisionEnd||checksumStart<=tokenEnd||
    !zjPidUnsigned(record.substring(2,revisionEnd),UINT32_MAX,config.revision)||!config.revision||
    !zjPidUnsigned(record.substring(checksumStart+1),UINT32_MAX,checksum)||
    checksum!=zjSettingsChecksum(record.substring(0,checksumStart)))return false;
 config.requestId=record.substring(revisionEnd+1,tokenEnd);
 if(!zjPidToken(config.requestId)||!zjPidParseGains(record.substring(tokenEnd+1,checksumStart),config))return false;
 config.persisted=true;return true;
}
static bool zjPidLoad(Preferences& prefs){
 zjPidSettings=ZjPidSettings{};
 const String active=prefs.getString("pidActive","");
 if(active.isEmpty())return true;
 if(active!="0"&&active!="1")return false;
 ZjPidSettings loaded;
 if(!zjPidDecode(prefs.getString(ZJ_PID_KEYS[active=="1"],""),loaded))return false;
 zjPidSettings=loaded;return true;
}
static const char* zjPidSave(Preferences& prefs,ZjPidSettings next,uint32_t expected){
 const bool same=std::equal(next.gains,next.gains+9,zjPidSettings.gains);
 if(zjPidSettings.persisted&&next.requestId==zjPidSettings.requestId)
  return same&&expected==zjPidSettings.revision-1?nullptr:"REQUEST_ID_REUSED";
 if(expected!=zjPidSettings.revision||expected==UINT32_MAX)return "REVISION_CONFLICT";
 const String active=prefs.getString("pidActive","");
 if(!active.isEmpty()&&active!="0"&&active!="1")return "STORAGE_FAILED";
 // No comparison with float text: all nine fields have canonical integer units.
 next.revision=expected+1;
 const char* key=ZJ_PID_KEYS[active=="0"];
 const String stage=zjPidRecord(next),selector=active=="0"?"1":"0";
 ZjPidSettings checked;
 const auto verify=[&]{
  const String record=prefs.getString(key,"");
  return record==stage&&zjPidDecode(record,checked);
 };
 if(prefs.putString(key,stage)!=stage.length()||!verify()||
    prefs.putString("pidActive",selector)!=selector.length()||
    prefs.getString("pidActive","")!=selector)return "STORAGE_FAILED";
 zjPidSettings=checked;return nullptr;
}
