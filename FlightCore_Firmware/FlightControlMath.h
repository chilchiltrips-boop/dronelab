#pragma once
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
struct FlightSettings{
 float maxTilt=50,maxRate=75,gyroHz=60,dtermHz=30;
 float lowCell=3.5f,criticalCell=3.3f,batteryFactor=1;
 uint16_t idleUs=1152,maxMotorUs=1952,maxThrottle=1800;
 uint8_t orientation=0,batteryKind=0,batteryAddress=0x40,cells=3;
 bool modeSwitch=true,handover=true;
};
namespace FlightMath{
inline float clamp(float v,float lo,float hi){return fmaxf(lo,fminf(hi,v));}
inline float lowPass(float old,float sample,float hz,float dt){if(hz<=0)return sample;float a=dt/(dt+1.0f/(6.2831853f*hz));return old+a*(sample-old);}
inline float pidStep(float error,float kp,float ki,float kd,float dt,float hz,float& previous,float& integral,float& derivative){
 derivative=lowPass(derivative,(error-previous)/dt,hz,dt);
 integral=clamp(integral+ki*(error+previous)*dt*.5f,-400,400);previous=error;
 return clamp(kp*error+integral+kd*derivative,-400,400);
}
inline void orient(float& x,float& y,float& z,uint8_t orientation){
 // Four yaw rotations, optionally mounted upside-down. All matrices are right-handed.
 if(orientation>=4){y=-y;z=-z;}float a=x,b=y;
 switch(orientation%4){case 1:x=-b;y=a;break;case 2:x=-a;y=-b;break;case 3:x=b;y=-a;break;default:break;}
}
inline bool canHandover(const uint16_t a[10],const uint16_t b[10],bool fresh){
 if(!fresh||b[4]<1500)return false;
 for(int i=0;i<4;i++)if(abs((int)a[i]-(int)b[i])>(i==2?100:150))return false;
 return true;
}
inline bool valid(const FlightSettings& c){return isfinite(c.maxTilt)&&c.maxTilt>=5&&c.maxTilt<=50&&isfinite(c.maxRate)&&c.maxRate>=20&&c.maxRate<=300&&isfinite(c.gyroHz)&&c.gyroHz>=10&&c.gyroHz<=100&&isfinite(c.dtermHz)&&c.dtermHz>=5&&c.dtermHz<=80&&c.orientation<8&&c.idleUs>=1050&&c.idleUs<=1250&&c.maxMotorUs>=1700&&c.maxMotorUs<=2000&&c.maxThrottle>=1300&&c.maxThrottle<=1900&&c.maxThrottle<=c.maxMotorUs&&(c.batteryKind==0||c.batteryKind==1||c.batteryKind==2)&&c.batteryAddress>=0x40&&c.batteryAddress<=0x4F&&c.cells>=1&&c.cells<=6&&isfinite(c.lowCell)&&isfinite(c.criticalCell)&&c.criticalCell>=2.8f&&c.lowCell<=4.0f&&c.lowCell>c.criticalCell&&isfinite(c.batteryFactor)&&c.batteryFactor>=.5f&&c.batteryFactor<=1.5f;}
inline bool sixPoint(const float faces[6][3],float offsets[3],float scales[3]){
 for(int i=0;i<3;i++){float high=faces[2*i][i],low=faces[2*i+1][i];if(!isfinite(high)||!isfinite(low)||high<.75f||high>1.25f||low>-.75f||low<-1.25f)return false;offsets[i]=-(high+low)*.5f;scales[i]=2/(high-low);if(fabsf(offsets[i])>.25f||scales[i]<.8f||scales[i]>1.2f)return false;}return true;
}
}
