#include <cassert>
#include <iostream>
#include <vector>
#include "../FlightCore_Firmware/FlightCorePpmDecode.h"
struct Symbol {uint16_t duration0,level0,duration1,level1;};
static std::vector<Symbol> packet(bool inverted=false,uint16_t width=1500){
 std::vector<Symbol> p;
 for(unsigned n=0;n<8;n++)p.push_back({300,uint16_t(!inverted),uint16_t(width-300),uint16_t(inverted)});
 p.push_back({300,uint16_t(!inverted),0,uint16_t(inverted)});return p;
}
static bool decode(const std::vector<Symbol>& p,uint16_t (&channels)[8]){return zjDecodePpm(p.data(),p.size(),channels);}
int main(){
 uint16_t channels[8];
 for(bool inverted:{false,true})for(uint16_t width:{850,1000,1500,2000,2150}){
  auto p=packet(inverted,width);assert(decode(p,channels));for(auto c:channels)assert(c==width);
  p.back().duration1=2500;assert(decode(p,channels));
  p.insert(p.begin(),{2500,uint16_t(inverted),0,uint16_t(!inverted)});assert(decode(p,channels));
 }
 auto p=packet();p.pop_back();assert(!decode(p,channels)); // missing final separator
 p=packet();p[3].duration1=1900;assert(!decode(p,channels)); // 2200 us channel
 p=packet();p[3].duration0=40;assert(!decode(p,channels)); // malformed separator
 p=packet();p[3].duration1=2500;assert(!decode(p,channels)); // sync inside a truncated frame
 p=packet();p.push_back({300,1,1200,0});assert(!decode(p,channels)); // extra channel
 p.clear();assert(!decode(p,channels));
 // Independently timed channel widths survive arbitrary consumer/HTTP delay.
 p=packet();for(unsigned n=0;n<8;n++)p[n].duration1=uint16_t(700+n*125);
 assert(decode(p,channels));for(unsigned n=0;n<8;n++)assert(channels[n]==1000+n*125);
 std::cout<<"PASS hardware PPM packet decoding: polarity, endpoints, truncation, noise and eight channels\n";
}
