#pragma once
#include <stdint.h>

enum class ZjPpmFallbackDecision {WAIT,CANCEL,START_AP,BLOCKED};
inline ZjPpmFallbackDecision zjDecidePpmFallback(uint32_t elapsed,bool receiverFresh,
                                                  bool ppmSelectedInSta,bool outputsOff,bool busy){
 if(receiverFresh||!ppmSelectedInSta)return ZjPpmFallbackDecision::CANCEL;
 if(elapsed<350)return ZjPpmFallbackDecision::WAIT;
 if(!outputsOff||busy)return elapsed>=5000?ZjPpmFallbackDecision::BLOCKED:ZjPpmFallbackDecision::WAIT;
 return ZjPpmFallbackDecision::START_AP;
}
