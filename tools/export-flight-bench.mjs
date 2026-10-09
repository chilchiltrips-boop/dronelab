// Reproducible SI-unit teaching traces; no aircraft calibration is asserted.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createSimulator,startSimulator,stepSimulator,stopSimulator,setPID,PLANT,STEP,DEFAULT_PID} from '../js/tripod-physics.js';
import {simulateResponse} from '../js/tripod-experiments.js';
const dir=process.argv[2]||'test-output/numerical';mkdirSync(dir,{recursive:true});
const s=createSimulator();for(const b of Object.keys(s.pid))setPID(s,b,{p:0,i:0,d:0});startSimulator(s);
const rows=[['time_s','throttle_us','requested_rpm','actual_rpm','motor_thrust_N','total_upward_thrust_N','weight_N','thrust_weight','z_cm','v_cm_s','accel_m_s2','stop']];
for(const throttle of [1000,1200,1400,1600,1800,1400,1200,1000,0]){
 if(!throttle)stopSimulator(s);else s.throttle=throttle;
 for(let n=0;n<500;n++){stepSimulator(s);if(n%5===0)rows.push([rows.length*STEP*5,s.throttle,s.motorRequestedRPM[0],s.motorRPM[0],s.motorThrust[0],s.vertical.thrust,s.vertical.weight,s.vertical.ratio,s.vertical.z*100,s.vertical.velocity*100,s.vertical.acceleration,s.vertical.stop]);}
}
writeFileSync(dir+'/vertical-thrust.csv',rows.map(r=>r.join(',')).join('\n')+'\n');
const configurations=[['Stable','p',.9],['Low P','p',.3],['High P','p',2.8],['Low I','i',0],['High I','i',50],['Low D','d',0],['High D','d',.16]];
const results=configurations.map(([name,gain,value])=>{
 const r=simulateResponse({basePID:DEFAULT_PID,bank:'rateRoll',axis:'roll',mode:'acro',gain,values:[value,value],scenario:'combined',duration:8,environment:{batteryV:12.2,lag:.12,payloadG:0,gyroNoise:.07,noiseSeed:7919}}).results[0];
 const header=['time_s','target_deg_s','actual_deg_s','P','I','D','PID_sum','outer_rate_deg_s','measured_rate_deg_s','m1_command_pct','m2_command_pct','m3_command_pct','m4_command_pct','m1_rpm','m2_rpm','m3_rpm','m4_rpm','upward_N','z_cm'];
 const rows=r.samples.map(x=>[x.t,x.target,x.actual,x.terms.p,x.terms.i,x.terms.d,x.output,x.outerRate,x.measuredRate,...x.motors,...x.rpm,x.vertical.thrust,x.vertical.z*100]);
 const file=name.toLowerCase().replaceAll(' ','-')+'.csv';writeFileSync(dir+'/'+file,[header,...rows].map(r=>r.join(',')).join('\n')+'\n');return {name,gain,value,file,metrics:r.metrics};
});
writeFileSync(dir+'/metrics.json',JSON.stringify({educationalEstimate:true,plant:PLANT,fixedStep:STEP,conditions:'All seven presets: same seeded gyro noise, CG roll bias 2 mm, 1500 µs, battery 12.2 V, mass, lag, initial state and rate pulse.',results},null,2)+'\n');
console.log('PASS exported constrained vertical and 7 identical-condition PID traces:',dir);
