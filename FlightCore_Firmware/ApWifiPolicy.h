#pragma once
#include <string.h>
namespace ZfcApWifi {
inline bool credential(const char* value){return strcmp(value,"AP_WIFI")==0;}
inline bool allowed(bool ap,bool localPeer,const char* role){return ap&&localPeer&&(strcmp(role,"MOBILE")==0||strcmp(role,"WEB")==0);}
inline bool sessionAllowed(bool ap,const char* value){return !credential(value)||ap;}
inline bool physicalRcAllowed(const char* value,const char* role){return !credential(value)||strcmp(role,"MOBILE")==0;}
}
