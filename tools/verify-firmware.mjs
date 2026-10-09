import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BOARD,inspectImage} from '../js/firmware-image.js';

const root=new URL('../firmware/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('sample.json',root),'utf8'));
if(manifest.boardId!==BOARD.id||manifest.flashBytes!==BOARD.flashBytes||manifest.appOffset!=='0x10000')throw Error('Sample manifest board metadata is wrong.');
for(const kind of ['factory','app']){
  const entry=manifest[kind],bytes=await fs.readFile(new URL(entry.file,root));
  if(bytes.length!==entry.bytes)throw Error(`${kind} size differs from manifest.`);
  inspectImage(bytes,kind);
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==entry.sha256)throw Error(`${kind} SHA-256 differs from manifest.`);
  console.log(`${kind}: ${bytes.length} bytes, SHA-256 ${hash}`);
}
