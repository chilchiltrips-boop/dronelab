#pragma once
// ZEBJUS FlightCore V2: diagnostic-only, no motor outputs.
struct ZjStudent {String id,key;uint32_t expires=0,epoch=1;bool control=false;};
static ZjStudent zjStudents[4];static String zjRcStudent;
static int zjStudentIndex(const String& id){if(id.isEmpty())return -1;for(int i=0;i<4;i++)if(zjStudents[i].id==id)return i;return -1;}
static bool zjStudentAllowed(const String& id,uint32_t epoch,bool control=false){
 const int i=zjStudentIndex(id);if(i<0)return false;const auto& s=zjStudents[i];
 return s.epoch==epoch&&s.expires!=0&&int32_t(millis()-s.expires)<0&&(!control||s.control);
}
static void zjStudentRevoke(const String& id){
 const int i=zjStudentIndex(id);if(i<0)return;
 auto& s=zjStudents[i];s.expires=0;s.control=false;++s.epoch;
 if(zjRcStudent==id){zjRcRelease("STUDENT_PERMISSION_REVOKED");zjRcStudent="";}
}
static void zjStudentInit(){
 zjRcStudent="";
 for(int i=0;i<4;i++){
  auto& s=zjStudents[i];s=ZjStudent();
  s.id=zjPrefs.getString((String("stId")+i).c_str(),"");
  s.key=zjPrefs.getString((String("stKey")+i).c_str(),"");
  if(!zjAdminValue(s.id.c_str(),3,24,false)||!zjHex(s.key,64))s=ZjStudent();
  else s.key.toLowerCase();
 }
 // Live grants intentionally expire on each boot (there is no trusted wall clock).
}
static bool zjStudentProvision(const String& id,const String& privateKey){
 if(!zjAdminValue(id.c_str(),3,24,false)||!zjHex(privateKey,64))return false;
 int i=zjStudentIndex(id);if(i<0)for(int j=0;j<4;j++)if(zjStudents[j].id.isEmpty()){i=j;break;}
 if(i<0)return false;
 String key=privateKey;key.toLowerCase();zjStudentRevoke(id);
 if(zjPrefs.putString((String("stKey")+i).c_str(),key)!=key.length())return false;
 if(zjPrefs.putString((String("stId")+i).c_str(),id)!=id.length())return false;
 auto& s=zjStudents[i];s.id=id;s.key=key;s.control=false;s.expires=0;s.epoch++;
 return true;
}
static bool zjStudentGrant(const String& id,long minutes,const String& permission){
 int i=zjStudentIndex(id);
 if(i<0||minutes<1||minutes>30||(permission!="observe"&&permission!="control"))return false;
 zjStudentRevoke(id);auto& s=zjStudents[i];s.control=permission=="control";s.expires=millis()+uint32_t(minutes)*60000UL;return true;
}
static void zjStudentRemove(const String& id){
 int i=zjStudentIndex(id);if(i<0)return;zjStudentRevoke(id);
 zjPrefs.remove((String("stId")+i).c_str());zjPrefs.remove((String("stKey")+i).c_str());zjStudents[i]=ZjStudent();
}
static void zjStudentWatchdog(){
 if(zjRcStudent.isEmpty())return;const int i=zjStudentIndex(zjRcStudent);
 if(!zjRcOwned||i<0||!zjStudentAllowed(zjRcStudent,zjStudents[i].epoch,true)){
  if(zjRcOwned)zjRcRelease("STUDENT_GRANT_EXPIRED");zjRcStudent="";
 }
}
static String zjStudentInventory(){
 String out="{\"maxStudents\":4,\"students\":[";bool first=true;
 for(int i=0;i<4;i++){const auto& s=zjStudents[i];if(s.id.isEmpty())continue;
  if(!first)out+=',';first=false;const bool active=zjStudentAllowed(s.id,s.epoch);
  out+="{\"id\":"+zjJson(s.id)+",\"active\":"+(active?"true":"false")+",\"control\":"+(active&&s.control?"true":"false")+",\"secondsLeft\":"+String(active?uint32_t(s.expires-millis())/1000:0)+"}";
 }
 return out+"]}";
}
static bool zjStudentUsbCommand(char* line){
 const String cmd=line;if(!cmd.startsWith("ZJADMIN,STUDENT,"))return false;
 if(!zjAdminAuthorized()){Serial.println("ZJCLASS,ERR,TEACHER_UNLOCK_REQUIRED");return true;}
 if(cmd.startsWith("ZJADMIN,STUDENT,ADD,")){
  const String data=cmd.substring(20);const int comma=data.indexOf(',');
  Serial.println(comma>0&&zjStudentProvision(data.substring(0,comma),data.substring(comma+1))?"ZJCLASS,ACK,PROVISIONED":"ZJCLASS,ERR,INVALID_STUDENT");return true;
 }
 if(cmd.startsWith("ZJADMIN,STUDENT,ENABLE,")){
  const String data=cmd.substring(23);const int a=data.indexOf(','),b=data.indexOf(',',a+1);
  const String id=a>0?data.substring(0,a):String("");
  const String v=a>0&&b>a?data.substring(a+1,b):String("");
  bool numeric=!v.isEmpty()&&v.length()<=2;for(size_t i=0;i<v.length();i++)numeric=numeric&&v[i]>='0'&&v[i]<='9';
  Serial.println(zjStudentGrant(id,numeric?v.toInt():0,b>a?data.substring(b+1):String(""))?"ZJCLASS,ACK,GRANTED":"ZJCLASS,ERR,INVALID_GRANT");return true;
 }
 if(cmd.startsWith("ZJADMIN,STUDENT,REVOKE,")){
  const String id=cmd.substring(23);if(zjStudentIndex(id)<0)Serial.println("ZJCLASS,ERR,UNKNOWN_STUDENT");
  else{zjStudentRevoke(id);Serial.println("ZJCLASS,ACK,REVOKED");}return true;
 }
 if(cmd.startsWith("ZJADMIN,STUDENT,REMOVE,")){
  const String id=cmd.substring(23);if(zjStudentIndex(id)<0)Serial.println("ZJCLASS,ERR,UNKNOWN_STUDENT");
  else{zjStudentRemove(id);Serial.println("ZJCLASS,ACK,REMOVED");}return true;
 }
 Serial.println("ZJCLASS,ERR,UNKNOWN_COMMAND");return true;
}
