// Extracted from the supplied V18.3.82 model-assets reference.
// Each feature receives the project's shared runtime explicitly.
export function register(ctx) {
ctx.assetTemplates = new Map();

ctx.assetLoadErrors = new Map();

ctx.assetLoadPromise = null;

ctx.assetsReady = false;

ctx.assetTransforms = {
 'f450_arm_red.glb':{scale:[1,1,ctx.ARM_GLTF_Z_SCALE]},
 'f450_arm_white.glb':{scale:[1,1,ctx.ARM_GLTF_Z_SCALE]}
};

ctx.tuneLoadedModel = function tuneLoadedModel(root,path){
 const t=ctx.assetTransforms[path];if(t?.scale)root.scale.set(...t.scale);if(t?.position)root.position.set(...t.position);if(t?.rotation)root.rotation.set(...t.rotation);
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=true}});root.updateMatrixWorld(true);return root
};

ctx.loadAssets = function loadAssets(){
 if(ctx.assetLoadPromise)return ctx.assetLoadPromise;
 const paths=[...new Set(ctx.products.flatMap(c=>[c.asset,c.assetCCW]).filter(Boolean))];
 ctx.assetLoadPromise=Promise.all(paths.map(async path=>{try{const root=ctx.tuneLoadedModel(await ctx.loadGLB(path),path);ctx.assetTemplates.set(path,root);return true}catch(e){ctx.assetLoadErrors.set(path,String(e?.message||e));console.warn('[ZEBJUS] GLB fallback:',path,e);return false}})).then(result=>{ctx.assetsReady=true;return{runtime:'glb+procedural-fallback',offline:true,total:paths.length,loaded:result.filter(Boolean).length,failed:result.filter(x=>!x).length,errors:Object.fromEntries(ctx.assetLoadErrors)}});
 return ctx.assetLoadPromise
};

ctx.cloneAsset = function cloneAsset(path){
 const src=ctx.assetTemplates.get(path);if(!src)return null;const root=src.clone(true);root.traverse(o=>{if(o.isMesh&&o.material){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone()}});return root
};
}
