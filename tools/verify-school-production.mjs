/* Fail-closed production release policy. This CLI NEVER burns eFuses,
 * signs binaries, or changes an attached Kit. Validation is read-only.
 * Production signing and chip provisioning are separate audited stages.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(new URL('../',import.meta.url).pathname);
const fail=msg=>{throw Error('School production release BLOCKED: '+msg)};
const outside=p=>{
 if(!p)fail('supply private production attestation/signature/public-key file paths');
 const resolved=path.resolve(p);
 if(resolved===root||resolved.startsWith(root+path.sep))fail('production attestation/key material must remain outside the public repository');
 return resolved;
};
const attestation=outside(process.env.ZEBJUS_RELEASE_ATTESTATION_PATH);
const signature=outside(process.env.ZEBJUS_RELEASE_ATTESTATION_SIGNATURE_PATH);
const publicKey=outside(process.env.ZEBJUS_RELEASE_PUBLIC_KEY_PATH);
const raw=fs.readFileSync(attestation);
const sig=fs.readFileSync(signature);
const pub=fs.readFileSync(publicKey,'utf8');
// Ed25519 attestation signature proves the release metadata is issued by
// the trusted school production signer; the ESP32 Secure Boot image signature
// must ALSO be independently verified by ROM/bootloader on physical hardware.
if(!crypto.verify(null,raw,pub,sig))fail('Ed25519 release attestation signature invalid');
const record=JSON.parse(raw.toString('utf8'));
if(record.schema!==1||record.channel!=='school-production'||!Array.isArray(record.kits)||record.kits.length===0)
 fail('production channel/kit list missing');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'firmware-catalog.json'),'utf8'));
for(const kit of record.kits){
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(kit.kitId)||!kit.kitId.startsWith(kit.boardId+'-'))
  fail('invalid Device ID / board');
 if(kit.secureBootVerified!==true||kit.flashEncryptionReleaseVerified!==true||kit.signedBootloaderVerified!==true||
    kit.signedAppVerified!==true||kit.otaRollbackVerified!==true||
    kit.verifiedOnHardware!==true||kit.manufacturingKeyControlVerified!==true)
  fail(kit.kitId+': missing security, key-custody, or rollback evidence');
 const expected=catalog.boards.find(b=>b.id===kit.boardId)?.latest?.app;
 if(!expected?.available||kit.sourceAppSha256!==expected.sha256)
  fail(kit.kitId+': unverified unsigned source release provenance');
 const signedImagePath=outside(kit.signedAppPath);
 if(!/^[a-f0-9]{64}$/i.test(kit.signedAppSha256||'')||
    crypto.createHash('sha256').update(fs.readFileSync(signedImagePath)).digest('hex')!==kit.signedAppSha256.toLowerCase())
  fail(kit.kitId+': production signed binary digest does not match audited image');
}
console.log('School production release ATTESTATION VERIFIED for '+record.kits.length+' kits. Hardware provisioning evidence remains externally audited.');
