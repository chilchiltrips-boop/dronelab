#pragma once
namespace RcPriority {
enum Source {NONE=0,NETWORK=1,PPM=2};
inline Source choose(bool training,unsigned preference,bool ppm,bool network){
 if(training)return preference==2?(ppm?PPM:NONE):(network?NETWORK:NONE);
 if(ppm)return PPM;
 return preference!=2&&network?NETWORK:NONE;
}
}
