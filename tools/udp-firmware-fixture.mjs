// Radio/flash doubles around the actual production UDP/auth/status/OTA headers.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawn} from 'node:child_process';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function section(source,start,end){const at=source.indexOf(start),to=source.indexOf(end,at);if(at<0||to<at)throw Error('Production source extraction failed: '+start);return source.slice(at,to);}
export async function startFirmwareHost(){
 const directory=mkdtempSync(join(tmpdir(),'zj-udp-host-'));let child;
 const stop=()=>{child?.kill();rmSync(directory,{recursive:true,force:true})};
 try{
  const source=read('FlightCore_Firmware/FlightCoreNetwork.h');
  const extract=section(source,'static String zjJson(', '\n#include "FlightCoreWifiProfiles.h"')+'\n'+
   section(source,'static String zjStatus(){','static const char* zjClientTransport(){')+'\n'+
   section(source,'static void zjRpcLoop(){','static void zjNetworkSetup(){')+'\nstatic void setupHostTelemetry(){\n'+
   section(source,' zjHttp.on("/api/health"',' // AP-local Kit identity maintenance')+'\n'+
   section(source,' zjHttp.on("/api/telemetry"',' zjHttp.on("/api/command"')+'\n}\n';
  writeFileSync(join(directory,'udp-network-extract.h'),extract);
  execFileSync('g++',['-std=c++17','-Itools/host-stubs','-I'+directory,'tools/udp-firmware-host.cpp','-lcrypto','-o',join(directory,'firmware')],{stdio:'pipe',timeout:60000});
  child=spawn(join(directory,'firmware'),[],{stdio:['ignore','pipe','pipe']});
  const port=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Firmware host startup timeout')),5000);
   child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error('Firmware host exited: '+code))});
   child.stdout.once('data',data=>{clearTimeout(timer);resolve(Number(data.toString().trim()))});
  });
  if(!(port>0))throw Error('Invalid firmware host port');return {directory,child,port,stop};
 }catch(error){stop();throw error}
}
