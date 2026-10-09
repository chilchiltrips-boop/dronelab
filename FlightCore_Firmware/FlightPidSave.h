#pragma once
struct PidSaveMessage {FlightPidSettings pid;uint32_t revision;};
QueueHandle_t pidSaveQueue=nullptr;FlightPidSettings pendingPid;uint32_t pendingPidRevision=0;
void pidSaveTask(void*){PidSaveMessage m;for(;;)if(xQueueReceive(pidSaveQueue,&m,portMAX_DELAY)==pdTRUE){Preferences p;bool ok=p.begin("zjpid",false);if(ok){PidSaveRecord record;record.pid=m.pid;record.revision=m.revision;ok=p.putBytes("record_v3",&record,sizeof(record))==sizeof(record);p.end();}portENTER_CRITICAL(&stateMux);if(ok)pidSavedRevision=m.revision;pidSaveBusy=false;portEXIT_CRITICAL(&stateMux);}}
void startPidSaveWorker(){pidSaveQueue=xQueueCreate(1,sizeof(PidSaveMessage));if(pidSaveQueue&&xTaskCreate(pidSaveTask,"fc-pid-save",3072,nullptr,1,nullptr)!=pdPASS){vQueueDelete(pidSaveQueue);pidSaveQueue=nullptr;}}
void applyPendingPid(){
 bool changed=false;portENTER_CRITICAL(&stateMux);if(pidApplyPending){flightPid=pendingPid;pidRevision=pendingPidRevision;pidApplyPending=false;changed=true;}portEXIT_CRITICAL(&stateMux);if(changed)resetFlightPid();
}
bool securePidCommand(const String& type){
 if(type!="pid_set"&&type!="pid_get")return false;
 if(type=="pid_get"){sendJson(200,"{\"ok\":true,\"pid\":"+pidJson()+",\"pidRevision\":"+String(pidRevision)+",\"savedRevision\":"+String(pidSavedRevision)+",\"saving\":"+String(pidSaveBusy?"true":"false")+"}");return true;}
 if(!FLIGHT_CONTROL_ENABLED||!server.secureContext||!securePidPermission()){sendMessage(403,"PID save requires paired kit owner or training browser permission");return true;}
 if(armed||benchMode!=BENCH_NONE||firmwareUploadActive||!pidSaveQueue||pidSaveBusy||pidApplyPending){sendMessage(423,"Land and disarm; wait for previous PID save");return true;}
 if(!server.hasArg("pidRevision")||uint32_t(server.arg("pidRevision").toInt())!=pidRevision){sendMessage(409,"PID revision changed; read current kit values before saving");return true;}
 FlightPidSettings next=flightPid;readPidArgs(next);if(!pidConfigValid(next)){sendMessage(400,"PID values outside guarded limits");return true;}
 ConfigGuard guard(!trainingActive);if(!trainingActive&&!guard.held){sendMessage(423,"Kit configuration is busy");return true;}
 PidSaveMessage m={next,pidRevision+1};portENTER_CRITICAL(&stateMux);pendingPid=next;pendingPidRevision=m.revision;pidApplyPending=true;pidSaveBusy=true;portEXIT_CRITICAL(&stateMux);
 if(xQueueSend(pidSaveQueue,&m,0)!=pdTRUE){portENTER_CRITICAL(&stateMux);pidApplyPending=pidSaveBusy=false;portEXIT_CRITICAL(&stateMux);sendMessage(503,"PID save queue busy");return true;}
 sendJson(202,"{\"ok\":true,\"saved\":false,\"saving\":true,\"pidRevision\":"+String(m.revision)+",\"message\":\"PID queued; read savedRevision to confirm persistence\"}");return true;
}
