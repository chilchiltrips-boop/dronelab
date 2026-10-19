import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('production LED commands survive a loop clock captured before SET/KEEP and still expire',()=>{
 const src=readFileSync(new URL('../FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino',import.meta.url),'utf8');
 const between=(start,end)=>{
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'production function boundaries must exist');return src.slice(a,b);
 };
 // Compile unchanged production functions; only Arduino clock/PWM/Serial are doubles.
 const code=`#include <cstdint>\n#include <cstdio>\n#include <cstring>\n#include <cstdlib>\n#include <cassert>\n#include <iostream>\n
static unsigned long clockMs=1001;static unsigned long millis(){return clockMs;}
static int level=0;static void ledcWrite(int,int value){level=value;}
static int constrain(int v,int lo,int hi){return v<lo?lo:v>hi?hi:v;}
struct {template<class... T>void print(T...){}template<class... T>void println(T...){} } Serial;
constexpr uint8_t LED_PIN=8,BUS_SDA=4,BUS_SCL=5;
${between('constexpr unsigned long LED_LEASE_MS=','void printFirmwareInfo()')}
${between('void ledAck(','#include "FlightCoreClassroom.h"')}
${between('void ledCommand(','void requestScan();')}
${between('void updateLedEffect(','// Board-specific USB gyroscope telemetry.')}
int main(){
 char on[]="ZJLED,1,SET,100";ledCommand(on);updateLedEffect(1000);
 assert(ledMode==LED_MANUAL&&level==0);
 clockMs=2001;char keep[]="ZJLED,2,KEEP";ledCommand(keep);updateLedEffect(2000);
 assert(ledMode==LED_MANUAL);
 clockMs=6001;updateLedEffect(clockMs);assert(ledMode==LED_MANUAL);
 clockMs=6002;updateLedEffect(clockMs);assert(ledMode==LED_OFF&&level==255);
 clockMs=7001;char blink[]="ZJLED,3,BLINK,100,100,100";ledCommand(blink);updateLedEffect(7000);
 assert(ledMode==LED_BLINK&&level==0);
 clockMs=7101;updateLedEffect(clockMs);assert(level==255);
 std::cout<<"PASS production LED lease and effects"<<std::endl;
}`;
 const dir=mkdtempSync(join(tmpdir(),'zj-led-'));
 try{
  const file=join(dir,'led.cpp'),bin=join(dir,'led');writeFileSync(file,code);
  execFileSync('g++',['-std=c++17',file,'-o',bin],{stdio:'pipe',timeout:60000});
  assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS production LED lease/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
