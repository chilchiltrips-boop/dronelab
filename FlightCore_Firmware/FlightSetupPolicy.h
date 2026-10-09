#pragma once
#include <stdint.h>
namespace FlightSetupPolicy {
struct ReceiverSetup {
 uint16_t minimum[8]={1000,1000,1000,1000,1000,1000,1000,1000};
 uint16_t centre[8]={1500,1500,1500,1500,1500,1500,1500,1500};
 uint16_t maximum[8]={2000,2000,2000,2000,2000,2000,2000,2000};
 uint8_t channel[8]={0,1,2,3,4,5,255,255};
 bool calibrated=false;uint8_t txMode=2;
};
inline bool valid(const ReceiverSetup& r){
 if(r.txMode<1||r.txMode>4)return false;
 uint16_t seen=0;for(int i=0;i<8;i++){
  if(r.channel[i]==255){if(i<4)return false;continue;}
  if(r.channel[i]>9||(seen&(1<<r.channel[i])))return false;seen|=1<<r.channel[i];
  if(r.minimum[i]<750||r.maximum[i]>2250||r.maximum[i]-r.minimum[i]<400||r.centre[i]<r.minimum[i]||r.centre[i]>r.maximum[i])return false;
  if((i==0||i==1||i==3)&&(r.centre[i]-r.minimum[i]<150||r.maximum[i]-r.centre[i]<150))return false;
 }return true;
}
inline uint16_t normalise(uint16_t raw,int i,const ReceiverSetup& r,bool reverse){
 if(i<0||i>=8||r.channel[i]==255)return 1000;
 if(!r.calibrated)return reverse?3000-raw:raw;
 int v=raw<r.minimum[i]?r.minimum[i]:raw>r.maximum[i]?r.maximum[i]:raw;
 if(i==0||i==1||i==3)v=v<r.centre[i]?1000+(v-r.minimum[i])*500/(r.centre[i]-r.minimum[i]):1500+(v-r.centre[i])*500/(r.maximum[i]-r.centre[i]);
 else v=1000+(v-r.minimum[i])*1000/(r.maximum[i]-r.minimum[i]);
 return reverse?3000-v:v;
}
inline bool live(uint32_t now,uint32_t expires){return (int32_t)(expires-now)>0;}
inline bool safeAfterSetup(const uint16_t rc[10]){return rc[2]<=1050&&rc[4]<1500&&rc[0]>=1420&&rc[0]<=1580&&rc[1]>=1420&&rc[1]<=1580&&rc[3]>=1420&&rc[3]<=1580;}
}
