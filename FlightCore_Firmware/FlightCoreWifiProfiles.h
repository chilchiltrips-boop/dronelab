#pragma once
// One NVS record commits the entire profile list; failed tests never call save.
// Public status contains SSIDs only. Passwords stay inside controller storage.
struct ZjWifiProfile {String ssid,pass;};
static constexpr int ZJ_WIFI_PROFILES=5;
static ZjWifiProfile zjWifiProfiles[ZJ_WIFI_PROFILES];
static int zjWifiCount=0;
static String zjLengthField(size_t n){return (n<10?String("0"):String(""))+String(n);}
static bool zjSaveProfiles(const ZjWifiProfile* profiles,int count){
 String record="v1|";
 for(int i=0;i<count;i++){
  if(profiles[i].ssid.isEmpty()||profiles[i].ssid.length()>32||profiles[i].pass.length()>63||(!profiles[i].pass.isEmpty()&&profiles[i].pass.length()<8))return false;
  record+=zjLengthField(profiles[i].ssid.length())+zjLengthField(profiles[i].pass.length())+profiles[i].ssid+profiles[i].pass;
 }
 const String previous=zjPrefs.getString("profiles","");
 if(zjPrefs.putString("profiles",record)!=record.length()||zjPrefs.getString("profiles","")!=record){zjPrefs.putString("profiles",previous);return false;}
 zjWifiCount=count;for(int i=0;i<ZJ_WIFI_PROFILES;i++)zjWifiProfiles[i]=i<count?profiles[i]:ZjWifiProfile();
 zjSavedSsid=count?profiles[0].ssid:String("");zjSavedPass=count?profiles[0].pass:String("");return true;
}
static void zjLoadProfiles(){
 const String record=zjPrefs.getString("profiles","");ZjWifiProfile loaded[ZJ_WIFI_PROFILES];int count=0;size_t at=3;
 bool valid=record.startsWith("v1|");
 while(valid&&at<record.length()){
  if(count>=ZJ_WIFI_PROFILES||at+4>record.length()){valid=false;break;}
  for(size_t i=at;i<at+4;i++)if(record[i]<'0'||record[i]>'9')valid=false;
  const int n=record.substring(at,at+2).toInt(),p=record.substring(at+2,at+4).toInt();at+=4;
  if(!valid||n<1||n>32||p>63||(p>0&&p<8)||at+n+p>record.length()){valid=false;break;}
  loaded[count++]={record.substring(at,at+n),record.substring(at+n,at+n+p)};at+=n+p;
 }
 if(valid){zjWifiCount=count;for(int i=0;i<count;i++)zjWifiProfiles[i]=loaded[i];zjSavedSsid=count?loaded[0].ssid:String("");zjSavedPass=count?loaded[0].pass:String("");}
 else if(zjSavedSsid.length()){zjWifiCount=1;zjWifiProfiles[0]={zjSavedSsid,zjSavedPass};}
}
static bool zjRememberProfile(const String& ssid,const String& pass){
 ZjWifiProfile next[ZJ_WIFI_PROFILES];next[0]={ssid,pass};int count=1;
 for(int i=0;i<zjWifiCount&&count<ZJ_WIFI_PROFILES;i++)if(zjWifiProfiles[i].ssid!=ssid)next[count++]=zjWifiProfiles[i];
 return zjSaveProfiles(next,count);
}
static bool zjSelectProfile(const String& ssid){
 for(int i=0;i<zjWifiCount;i++)if(zjWifiProfiles[i].ssid==ssid)return zjRememberProfile(ssid,zjWifiProfiles[i].pass);
 return false;
}
static bool zjForgetProfile(const String& ssid){
 ZjWifiProfile next[ZJ_WIFI_PROFILES];int count=0;bool found=false;
 for(int i=0;i<zjWifiCount;i++){if(zjWifiProfiles[i].ssid==ssid)found=true;else next[count++]=zjWifiProfiles[i];}
 return found&&zjSaveProfiles(next,count);
}
static String zjProfilesStatus(){
 String out="{\"preferred\":"+zjJson(zjSavedSsid)+",\"networks\":[";
 for(int i=0;i<zjWifiCount;i++){if(i)out+=',';out+="{\"ssid\":"+zjJson(zjWifiProfiles[i].ssid)+",\"preferred\":"+(i==0?String("true"):String("false"))+"}";}
 return out+"]}";
}
