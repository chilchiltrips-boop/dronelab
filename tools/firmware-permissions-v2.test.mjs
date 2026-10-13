import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load = (name) => readFileSync(new URL('../FlightCore_Firmware/' + name, import.meta.url), 'utf8');
const enrollment=load('FlightCoreEnrollment.h'),net=load('FlightCoreNetwork.h'),policy=load('FlightCorePermissions.h');
const classroom=load('FlightCoreClassroom.h'),ino=load('I2C_ADDRESS_SCANNER.ino');
test('1.5.0 V2 review source advertises the intended running version',()=>{
 assert.match(ino,/FW_VERSION="1\.5\.0"/);
 assert.equal(readFileSync(new URL('../VERSION.txt',import.meta.url),'utf8').trim(),'1.5.0');
});
test('student credentials are not borrowed from setup/diagnostic credential',()=>{
 assert.match(enrollment,/kind=="student"&&slotId>=0\?zjStudents\[slotId\]\.key:zjDiagnosticKey/);
 assert.match(enrollment,/zjHttp\.arg\("studentId"\)!=studentId/);
 assert.match(enrollment,/s\.student=kind=="student"/);
 assert.match(enrollment,/s\.student&&!zjStudentAllowed\(s\.studentId,s\.epoch\)/);
});
test('separate read and control permissions are firmware route guards',()=>{
 for(const route of ['rc/claim','rc/preview','rc/release']){
  assert.match(net,new RegExp('zjHttp\\.on\\("/api/'+route+'",HTTP_POST,\\[\\]\\(\\)\\{\\s*if\\(!zjAllowControl\\(\\)\\)return;'));
 }
 for(const route of ['command','telemetry'])assert.match(net,new RegExp('zjHttp\\.on\\("/api/'+route+'",HTTP_(GET|POST),\\[\\]\\(\\)\\{\\s*if\\(!zjAllowObserve\\(\\)\\)return;'));
 assert.match(net,/zjStudentAllowed\(s\.studentId,s\.epoch,true\)/);
});
test('teacher-only grants and takeover are separate; no student OTA',()=>{
 for(const route of ['classroom/students','classroom/grant','classroom/revoke','classroom/takeover'])
  assert.match(net,new RegExp('"/api/'+route+'"'));
 assert.match(net,/zjAuthenticated\(\)&&zjAuthAdmin&&String\(zjClientTransport\(\)\)=="STA"/);
 assert.match(net,/zjRcRelease\("TEACHER_TAKEOVER"\)/);
 assert.match(net,/zjStudentWatchdog\(\);zjRcLoop\(now\);/);
});
test('USB teacher unlock gates student provisioning and revocation destroys sessions',()=>{
 assert.match(classroom,/if\(!strncmp\(line,"ZJADMIN,STUDENT,",16\)\)return false;/);
 assert.match(net,/if\(zjStudentUsbCommand\(line\)\)return true;/);
 assert.match(policy,/if\(!zjAdminAuthorized\(\)\)/);
 assert.match(policy,/session=ZjSession\(\)/);
 assert.match(policy,/minutes<1\|\|minutes>30/);
 assert.match(policy,/zjRcRelease\("STUDENT_PERMISSION_REVOKED"\)/);
 assert.match(policy,/s=ZjStudent\(\)/); // reboot starts with no live grants
});
