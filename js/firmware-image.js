export {sha256,sha256Fallback,md5Hex} from './firmware-hashes.js';
export const APP_OFFSET=0x10000, OTA_SLOT=0x1e0000, FLASH_BYTES=0x400000;
const u16=(b,i)=>b[i]|b[i+1]<<8;
const u32=(b,i)=>(b[i]|b[i+1]<<8|b[i+2]<<16|b[i+3]<<24)>>>0;
export function boardFromChip(catalog,chip){return catalog.boards.find(b=>b.imageChipIds.includes(chip))||null}
export function imageType(bytes){return bytes.length>APP_OFFSET+32768&&bytes[APP_OFFSET]===0xe9?'factory':'app'}
export function inspectImage(bytes,kind,board,catalog){
  if(!(bytes instanceof Uint8Array)||bytes.length<32768)throw Error('The firmware file is truncated or too small.');
  if(!['app','factory'].includes(kind)||!board)throw Error('Choose a known board and image type.');
  const offset=kind==='factory'?APP_OFFSET:0;
  if(bytes.length> (kind==='factory'?FLASH_BYTES:OTA_SLOT)||bytes.length<offset+32768)throw Error('Image exceeds the flash/OTA slot or is truncated.');
  if(bytes[0]!==0xe9||bytes[offset]!==0xe9)throw Error('ESP image magic 0xE9 is missing at the required offset.');
  for(const at of [0,offset]){
    if(bytes[at+1]<1||bytes[at+1]>16)throw Error('ESP image segment table is invalid.');
    const chip=u16(bytes,at+12);
    if(!board.imageChipIds.includes(chip))throw Error(`Image chip ID ${chip} does not match ${board.name}.`);
  }
  if(u32(bytes,offset+32)!==0xabcd5432)throw Error('Application descriptor is missing. A Factory image cannot be used as an APP.');
  if(kind==='factory'){
    if(bytes.length!==FLASH_BYTES)throw Error('Factory image must be the complete 4 MB merged build.');
    if(u16(bytes,0x8000)!==0x50aa)throw Error('Factory partition table is missing at 0x8000.');
    const slots=[];for(let i=0x8000;i<0x9000;i+=32){if(u16(bytes,i)!==0x50aa)break;if(bytes[i+2]===0&&[0x10,0x11].includes(bytes[i+3]))slots.push([u32(bytes,i+4),u32(bytes,i+8)])}
    if(slots.length!==2||slots[0][0]!==APP_OFFSET||slots[1][0]!==0x1f0000||slots.some(x=>x[1]!==OTA_SLOT))throw Error('Factory image lacks the required ZFC_DUAL_1E0000 partition layout.');
  }
  const nonempty=bytes.subarray(offset,Math.min(bytes.length,offset+32768));
  if(nonempty.every(x=>x===0||x===255))throw Error('Firmware contents are empty.');
  const detected=boardFromChip(catalog,u16(bytes,offset+12));
  return {kind,address:kind==='factory'?0:APP_OFFSET,chipId:u16(bytes,offset+12),boardId:detected?.id,bytes:bytes.length};
}
export function ensureOtaReady({info,deviceId,boardId,image,owner}){
  if(!image||image.kind!=='app')throw Error('AP OTA requires an Application image.');
  if(!deviceId||info.deviceId!==deviceId)throw Error('Kit Device ID changed. Reconnect the intended controller.');
  if(info.boardId!==boardId||image.boardId!==boardId)throw Error('Kit board and firmware image do not match.');
  if(info.armed!==false)throw Error('DISARM the kit before flashing.');
  if(!owner||info.lockMine!==true)throw Error('Take Control as owner before flashing.');
  if(info.benchMode&&!['NONE','none',0].includes(info.benchMode)||info.trainingActive||info.fcSetupActive)throw Error('Stop bench, setup and training activity before OTA.');
  if(info.partitionLayout!=='ZFC_DUAL_1E0000')throw Error('Older partition layout. Use USB Factory to migrate.');
  if(!Number.isFinite(+info.freeSketchBytes)||+info.freeSketchBytes<image.bytes.length)throw Error('Application exceeds the free OTA sketch space.');
}
export function usbWritePlan({image,board,chipId,flashBytes,erase=false,appReady=false,armed=false}){
  if(armed)throw Error('DISARM before flashing.');
  if(!image||!board||!board.imageChipIds.includes(chipId)||image.boardId!==board.id)throw Error('USB chip, board and image do not match.');
  if(!Number.isFinite(flashBytes)||flashBytes<FLASH_BYTES)throw Error('Flash capacity probe failed or is too small.');
  if(erase&&image.kind!=='factory')throw Error('Erase requires a complete Factory image.');
  if(image.kind==='app'&&!appReady)throw Error('Existing matching bootloader and dual OTA partitions must be confirmed.');
  const address=image.kind==='factory'?0:APP_OFFSET;
  if(address+image.bytes.length>flashBytes)throw Error('Image exceeds detected flash capacity.');
  return {address,eraseAll:false,flashMode:'keep',flashFreq:'keep',flashSize:'keep'};
}
export function inspectUsbLayout(boot,table,board){
  if(!(boot instanceof Uint8Array)||boot.length<16||boot[0]!==0xe9||!board.imageChipIds.includes(boot[12]|boot[13]<<8))throw Error('Existing USB bootloader is missing or belongs to another chip.');
  if(!(table instanceof Uint8Array)||table.length<64)throw Error('Existing partition table could not be read.');
  const slots=[];for(let i=0;i+32<=table.length;i+=32){if(u16(table,i)!==0x50aa)break;if(table[i+2]===0&&[0x10,0x11].includes(table[i+3]))slots.push([u32(table,i+4),u32(table,i+8)])}
  if(slots.length!==2||slots[0][0]!==APP_OFFSET||slots[1][0]!==0x1f0000||slots.some(x=>x[1]!==OTA_SLOT))throw Error('Existing partition table is not ZFC_DUAL_1E0000. Use USB Factory migration.');
  return true;
}
export function postBootVerified({reported,expectedVersion,boardId,deviceId,selectedDeviceId}){
  return !!reported&&reported.boardId===boardId&&!!selectedDeviceId&&(!deviceId||deviceId===selectedDeviceId)&&reported.firmware===expectedVersion;
}
export function usbConnectionError(error){
  const name=error?.name||'',message=String(error?.message||'');
  if(name==='NotFoundError')return Error('No USB serial port was selected. Connect the board with a data cable and try again.');
  if(name==='NotAllowedError'||name==='SecurityError')return Error('Web Serial permission was denied. Use desktop Chrome/Edge on HTTPS or localhost and grant this port.');
  if(['NetworkError','InvalidStateError'].includes(name)||/busy|already open|in use|access denied/i.test(message))return Error('USB port is busy. Close Serial Monitor or another flasher, then hold BOOT, tap RESET and retry at 115200.');
  return Error(message||'USB bootloader connection failed.');
}
