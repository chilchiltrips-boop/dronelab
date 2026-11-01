#pragma once
#include <stdint.h>
#include <string.h>
#include <stdio.h>

// Motor numbers are logical positions; pins are the four fixed A2 ESC outputs.
// Rotation is an observed wiring expectation, never an ESC reverse command.
struct ZjMotorConfig {
 bool plus=false;
 uint8_t pins[4]={0,1,2,3},rotation[4]={0,1,0,1};
 uint16_t minimumUs[4]={0,0,0,0};
 const char* layout()const{return plus?"A2_QUAD_PLUS":"A2_QUAD_X";}
 bool configure(const char* kind,const char* pinCode,const char* rotationCode){
  if(strcmp(kind,"A2_QUAD_X")&&strcmp(kind,"A2_QUAD_PLUS"))return false;
  if(strlen(pinCode)!=4||strlen(rotationCode)!=4)return false;
  uint8_t seen=0;
  for(int i=0;i<4;i++){
   if(pinCode[i]<'0'||pinCode[i]>'3'||rotationCode[i]<'0'||rotationCode[i]>'1')return false;
   const uint8_t bit=1U<<(pinCode[i]-'0');if(seen&bit)return false;seen|=bit;
  }
  bool wiringChanged=plus!=(strcmp(kind,"A2_QUAD_PLUS")==0);
  for(int i=0;i<4;i++)if(pins[i]!=pinCode[i]-'0'||rotation[i]!=rotationCode[i]-'0')wiringChanged=true;
  plus=strcmp(kind,"A2_QUAD_PLUS")==0;
  for(int i=0;i<4;i++){pins[i]=pinCode[i]-'0';rotation[i]=rotationCode[i]-'0';if(wiringChanged)minimumUs[i]=0;}
  return true;
 }
 bool setMinimum(uint8_t motor,uint16_t pulse){
  if(motor<1||motor>4||pulse<1000||pulse>2000)return false;
  minimumUs[motor-1]=pulse;return true;
 }
 void encode(char* out,size_t size)const{
  snprintf(out,size,"%c:%u%u%u%u:%u%u%u%u:%u:%u:%u:%u",plus?'P':'X',pins[0],pins[1],pins[2],pins[3],rotation[0],rotation[1],rotation[2],rotation[3],minimumUs[0],minimumUs[1],minimumUs[2],minimumUs[3]);
 }
 bool decode(const char* text){
  char kind=0,p[5]={},r[5]={},tail=0;unsigned a=0,b=0,c=0,d=0;
  if(sscanf(text,"%c:%4[0-3]:%4[01]:%u:%u:%u:%u%c",&kind,p,r,&a,&b,&c,&d,&tail)!=7||(kind!='P'&&kind!='X'))return false;
  ZjMotorConfig next;if(!next.configure(kind=='P'?"A2_QUAD_PLUS":"A2_QUAD_X",p,r))return false;
  const unsigned values[]={a,b,c,d};for(int i=0;i<4;i++){if(values[i]&&(values[i]<1000||values[i]>2000))return false;next.minimumUs[i]=values[i];}
  char canonical[64];next.encode(canonical,sizeof(canonical));if(strcmp(canonical,text))return false;
  *this=next;return true;
 }
 uint16_t physicalPulse(uint8_t output,const uint16_t logical[4])const{
  for(int i=0;i<4;i++)if(pins[i]==output)return logical[i];return 0;
 }
};
