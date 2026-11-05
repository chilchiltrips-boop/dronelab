import {readFileSync,writeFileSync} from 'node:fs';
import {PID_BANKS,PID_PROFILES} from '../js/pid-profiles.js';

const path=new URL('../FlightCore_Firmware/FlightCorePidProfiles.h',import.meta.url);
const rows=PID_PROFILES.map(({id,layout,gains})=>{
 if(!/^[a-z0-9-]+$/.test(id)||!['A2_QUAD_X','A2_QUAD_PLUS'].includes(layout))throw Error('Invalid PID profile metadata');
 const values=PID_BANKS.flatMap(bank=>['p','i','d'].map(term=>{
  const value=gains[bank]?.[term],encoded=Math.round(value*1000);
  if(!Number.isFinite(value)||value<0||value>100||Math.abs(value*1000-encoded)>1e-7)throw Error('Invalid PID profile gain');
  return encoded;
 }));
 return ` {"${id}",${layout==='A2_QUAD_PLUS'},{${values.join(',')}}}`;
});
const header=`#pragma once
#include <stdint.h>

// Generated from js/pid-profiles.js by tools/sync-pid-profiles.mjs.
static constexpr unsigned ZJ_PID_RATE_GAIN_COUNT=9,ZJ_PID_GAIN_COUNT=${PID_BANKS.length*3};
static constexpr const char* const ZJ_PID_AXES[]={${PID_BANKS.map(key=>JSON.stringify(key)).join(',')}};
struct ZjPidProfile {const char* id;bool plus;uint32_t gains[ZJ_PID_GAIN_COUNT];};
static constexpr ZjPidProfile ZJ_PID_PROFILES[]={
${rows.join(',\n')}
};
static constexpr unsigned ZJ_PID_PROFILE_COUNT=sizeof(ZJ_PID_PROFILES)/sizeof(ZJ_PID_PROFILES[0]);
`;
if(process.argv.includes('--check')){
 if(readFileSync(path,'utf8')!==header)throw Error('Regenerate FlightCorePidProfiles.h from js/pid-profiles.js');
}else writeFileSync(path,header);
