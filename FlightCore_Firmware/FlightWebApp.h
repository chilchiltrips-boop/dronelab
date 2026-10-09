#pragma once
// Browser binding is checked in the kit, with the same authenticated session as the monitor.
void clearTrainingWebApp(){portENTER_CRITICAL(&stateMux);trainingWebSession=0;trainingWebAppId=trainingObserverAt=0;portEXIT_CRITICAL(&stateMux);}
bool trainingWebAppLive(){return trainingObserverAt&&(uint32_t)(millis()-trainingObserverAt)<WebAppScope::LEASE_MS;}
bool scopedTrainingBrowser(){uint64_t bound;portENTER_CRITICAL(&stateMux);bound=trainingWebSession;portEXIT_CRITICAL(&stateMux);return secureCurrent&&bound&&secureCurrent->id==bound;}
uint32_t requestingWebAppId(){if(!server.secureContext||!secureCurrent||(secureCurrent->role!="WEB"&&secureCurrent->role!="COMPANION"))return 0;xSemaphoreTake(secureMutex,portMAX_DELAY);auto* e=webAppRegistry.find(secureCurrent->id,millis());uint32_t id=e?e->id:0;xSemaphoreGive(secureMutex);return id;}
bool canBindTrainingWebApp(const String& id){uint32_t n=WebAppScope::parse(id.c_str());if(!n)return false;xSemaphoreTake(secureMutex,portMAX_DELAY);auto* e=webAppRegistry.resolve(n,millis());auto* s=e?secureFind(e->session):nullptr;bool ok=s&&(s->role=="WEB"||s->role=="COMPANION");xSemaphoreGive(secureMutex);return ok;}
bool bindTrainingWebApp(const String& id){
 uint32_t n=WebAppScope::parse(id.c_str());if(!n)return false;
 xSemaphoreTake(secureMutex,portMAX_DELAY);auto* e=webAppRegistry.resolve(n,millis());auto* s=e?secureFind(e->session):nullptr;
 bool ok=s&&(s->role=="WEB"||s->role=="COMPANION");if(ok){portENTER_CRITICAL(&stateMux);trainingWebSession=s->id;trainingWebAppId=n;trainingObserverAt=millis();portEXIT_CRITICAL(&stateMux);}xSemaphoreGive(secureMutex);return ok;
}
// Called with secureMutex held. AP has no browser RC observer traffic.
bool secureMonitorAllowed(uint64_t sid){uint64_t bound;portENTER_CRITICAL(&stateMux);bound=trainingWebSession;portEXIT_CRITICAL(&stateMux);auto* session=secureFind(sid);if(!session)return false;if((session->role=="WEB"||session->role=="COMPANION")&&!webAppRegistry.find(sid,millis()))return false;return !trainingActive||!trainingAppOwned||sid==bound;}
void secureMonitorSeen(uint64_t sid){if(auto* s=secureFind(sid))s->lastActivity=millis();webAppRegistry.touch(sid,millis());portENTER_CRITICAL(&stateMux);if(sid==trainingWebSession)trainingObserverAt=millis();portEXIT_CRITICAL(&stateMux);}
void webAppRegister(bool remove){
 if(!secureCurrent||(secureCurrent->role!="WEB"&&secureCurrent->role!="COMPANION")){sendMessage(403,"Register a paired WebApp on the kit AP");return;}
 xSemaphoreTake(secureMutex,portMAX_DELAY);uint32_t id=0;if(remove){webAppRegistry.remove(secureCurrent->id);portENTER_CRITICAL(&stateMux);if(secureCurrent->id==trainingWebSession)trainingObserverAt=0;portEXIT_CRITICAL(&stateMux);}else id=webAppRegistry.add(secureCurrent->id,WebAppScope::parse(server.arg("webAppId").c_str()),millis());xSemaphoreGive(secureMutex);
 if(!remove&&!id){sendMessage(409,"Invalid WebApp ID or registry full; close an unused kit session");return;}
 sendJson(200,"{\"ok\":true,\"deviceId\":\""+deviceId+"\",\"webAppId\":\""+String(id)+"\",\"webAppRouting\":true,\"leaseMs\":10000}");
}

// Reclaim idle app and browser identities. Reconnect creates a fresh mobile
// client; its released sessions must not occupy every slot for two hours.
// Called with secureMutex held during an authenticated new pairing proof.
bool secureBrowserRetired(const SecureSession& s){uint64_t bound;portENTER_CRITICAL(&stateMux);bound=trainingWebSession;portEXIT_CRITICAL(&stateMux);return (s.role=="WEB"||s.role=="COMPANION"||s.role=="MOBILE")&&s.client!=controlOwner&&s.id!=bound&&!webAppRegistry.find(s.id,millis())&&(uint32_t)(millis()-s.lastActivity)>=WebAppScope::LEASE_MS;}
