#pragma once
#include <stddef.h>
#include <stdint.h>

namespace RcUdpProtocol {
constexpr uint16_t PORT = 4210;
constexpr size_t FRAME_BYTES = 48, ACK_BYTES = 28;
inline uint64_t get(const uint8_t* p, size_t n) {
    uint64_t value=0; for(size_t i=0;i<n;i++) value|=uint64_t(p[i])<<(8*i); return value;
}
inline void put(uint8_t* p, uint64_t value, size_t n) {
    for(size_t i=0;i<n;i++) p[i]=uint8_t(value>>(8*i));
}
struct Frame { uint64_t device,token; uint32_t sequence; uint16_t channels[10]; bool simulation=false; uint8_t version=1; };
inline bool decode(const uint8_t* p, size_t n, Frame& out) {
    if(n!=FRAME_BYTES || get(p,4)!=0x3143525a || !((p[4]==1&&p[5]==1)||(p[4]==2&&p[5]==2)) || get(p+6,2)!=0) return false;
    out.version=p[4];out.simulation=p[5]==2;
    out.device=get(p+8,8); out.token=get(p+16,8); out.sequence=get(p+24,4);
    for(size_t i=0;i<10;i++){out.channels[i]=get(p+28+2*i,2);if(out.channels[i]<1000||out.channels[i]>2000)return false;}
    return out.token!=0;
}
inline bool newer(uint32_t next,uint32_t previous){return int32_t(next-previous)>0;}
// A simulator grant never becomes a physical-flight grant, including on expiry.
inline bool permitted(const Frame& frame,bool simulationGrant,bool training,bool appInput){
    return frame.simulation==simulationGrant && (simulationGrant ? training&&appInput : !training);
}
inline void ack(uint8_t out[ACK_BYTES], const Frame& frame, bool armed, bool ready) {
    put(out,0x3141525a,4);out[4]=frame.version;out[5]=0;out[6]=(armed?1:0)|(ready?2:0)|(frame.simulation?4:0);out[7]=0;
    put(out+8,frame.device,8);put(out+16,frame.token,8);put(out+24,frame.sequence,4);
}
}
