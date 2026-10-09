#pragma once
#include <stdint.h>
// IDs route already-authenticated browser sessions on this kit. They are not passwords.
namespace WebAppScope {
constexpr uint32_t LEASE_MS=10000;
inline uint32_t parse(const char* s){uint32_t n=0;for(int i=0;i<6;i++){if(s[i]<'0'||s[i]>'9')return 0;n=n*10+s[i]-'0';}return s[6]==0&&n>=100000?n:0;}
struct Registry {
 struct Entry{uint64_t session=0;uint32_t id=0,seen=0;} entries[6];
 bool live(const Entry& e,uint32_t now)const{return e.session&&(uint32_t)(now-e.seen)<LEASE_MS;}
 Entry* find(uint64_t session,uint32_t now){for(auto& e:entries)if(e.session==session&&live(e,now))return &e;return nullptr;}
 Entry* resolve(uint32_t id,uint32_t now){for(auto& e:entries)if(e.id==id&&live(e,now))return &e;return nullptr;}
 uint32_t add(uint64_t session,uint32_t requested,uint32_t now){
  if(!session||requested<100000||requested>999999)return 0;
  if(auto* e=find(session,now)){e->seen=now;return e->id;}
  Entry* free=nullptr;for(auto& e:entries)if(!live(e,now)){free=&e;break;}if(!free)return 0;
  uint32_t id=requested;for(int i=0;i<7;i++){if(!resolve(id,now)){*free={session,id,now};return id;}id=id==999999?100000:id+1;}return 0;
 }
 bool touch(uint64_t session,uint32_t now){auto* e=find(session,now);if(!e)return false;e->seen=now;return true;}
 void remove(uint64_t session){for(auto& e:entries)if(e.session==session)e=Entry();}
};
}
