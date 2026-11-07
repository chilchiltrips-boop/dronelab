// Provisional controller gains. Replace a profile's values here after bench qualification,
// then regenerate FlightCorePidProfiles.h with node tools/sync-pid-profiles.mjs.
export const PID_BANKS=Object.freeze(['rateRoll','ratePitch','rateYaw','angleRoll','anglePitch']);
const baseline=Object.freeze({
 rateRoll:Object.freeze({p:.9,i:15,d:.03}),
 ratePitch:Object.freeze({p:.9,i:15,d:.03}),
 rateYaw:Object.freeze({p:3,i:15,d:0}),
 angleRoll:Object.freeze({p:3,i:0,d:0}),
 anglePitch:Object.freeze({p:3,i:0,d:0})
});
export const PID_PROFILES=Object.freeze([
 Object.freeze({id:'aerof450-quad-x',label:'Aerof450 · Quad X',layout:'A2_QUAD_X',gains:baseline}),
 Object.freeze({id:'aerof450-quad-plus',label:'Aerof450 · Quad +',layout:'A2_QUAD_PLUS',gains:baseline})
]);
export const DEFAULT_PID_PROFILE=PID_PROFILES[0];
export const getPidProfile=id=>PID_PROFILES.find(profile=>profile.id===id);
