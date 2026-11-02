#pragma once
#include <stdint.h>
#include <stddef.h>

// Decode one hardware-timed PPM-SUM packet at 1 MHz. Both polarities are
// supported. Nine separator pulses delimit exactly eight complete channels;
// never promote a truncated/noisy packet to a fresh receiver frame.
template<class Symbol> static bool zjDecodePpm(const Symbol* symbols,size_t count,uint16_t (&channels)[8]){
 if(!symbols||count<9||count>48)return false;
 for(unsigned active=0;active<2;active++){
  uint32_t time=0,previous=0;unsigned markers=0;bool bad=false;
  uint16_t decoded[8]={};
  for(size_t i=0;i<count&&!bad;i++)for(unsigned half=0;half<2;half++){
   const uint32_t duration=half?symbols[i].duration1:symbols[i].duration0;
   const unsigned level=half?symbols[i].level1:symbols[i].level0;
   if(!duration)continue; // RMT terminates the packet with a zero duration.
   if(level==active){
    if(duration<80||duration>650||markers>=9){bad=true;break;}
    if(markers){const uint32_t width=time-previous;if(width<850||width>2150){bad=true;break;}decoded[markers-1]=uint16_t(width);}
    previous=time;++markers;
   }else if(duration>=2500&&markers&&markers!=9){bad=true;break;}
   time+=duration;
  }
  if(!bad&&markers==9){for(unsigned i=0;i<8;i++)channels[i]=decoded[i];return true;}
 }
 return false;
}
