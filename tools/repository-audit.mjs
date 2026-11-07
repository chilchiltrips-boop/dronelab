// Inventory Git objects without opening binary contents. Does not mutate history.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const ref=process.argv[2]||'HEAD';
const entries=execFileSync('git',['ls-tree','-rlz',ref],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean).map(line=>{
 const [metadata,path]=line.split('\t'),[mode,type,object,size]=metadata.trim().split(/\s+/);
 return {path,mode,type,object,bytes:Number(size)};
});
const groups={},objects={};
for(const entry of entries){
 const group=entry.path.includes('/')?entry.path.split('/')[0]:'(root)';
 const value=groups[group]??={files:0,bytes:0};value.files++;value.bytes+=entry.bytes;
 (objects[entry.object]??=[]).push(entry);
}
console.log(JSON.stringify({ref,files:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),groups,
 duplicates:Object.values(objects).filter(a=>a.length>1).map(a=>({bytes:a[0].bytes,paths:a.map(e=>e.path)}))},null,2));
