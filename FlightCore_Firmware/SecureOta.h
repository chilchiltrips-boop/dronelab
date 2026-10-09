#pragma once
uint64_t otaSession=0;uint32_t otaExpected=0,otaAt=0;String otaDigest;mbedtls_sha256_context otaHash;
bool secureLayoutReady(){const esp_partition_t* running=esp_ota_get_running_partition();const esp_partition_t* next=esp_ota_get_next_update_partition(nullptr);return running&&next&&running->size==0x1e0000&&next->size==0x1e0000&&((running->address==0x10000&&next->address==0x1f0000)||(running->address==0x1f0000&&next->address==0x10000));}
void abortSecureOta(){if(firmwareUploadActive){Update.abort();mbedtls_sha256_free(&otaHash);}firmwareUploadActive=false;otaSession=0;}
void serviceSecureOta(){if(firmwareUploadActive&&millis()-otaAt>10000)abortSecureOta();}
void secureOta(const String& p){
 if(!secureOwner()||!controlAuthorized()||armed||benchMode!=BENCH_NONE||trainingActive||fcSetupActive){sendMessage(423,"Secure OTA requires owner control and an idle, disarmed kit");return;}
 if(p=="/api/firmware/begin"){
  uint32_t n=server.arg("size").toInt();String digest=server.arg("sha256");uint8_t hash[32];
  if(!secureLayoutReady()){sendMessage(409,"USB FACTORY migration required for the larger dual OTA layout");return;}
  if(firmwareUploadActive||n<24||n>0x1e0000||!secureUnhex(digest,hash,32)||server.arg("boardId")!=BOARD_ID){sendMessage(400,"Invalid firmware size, board or digest");return;}
  if(!Update.begin(n)){sendMessage(503,"OTA partition unavailable");return;}
  firmwareUploadActive=true;firmwareUploadBytes=0;otaExpected=n;otaDigest=digest;otaDigest.toLowerCase();otaSession=secureCurrent->id;otaAt=millis();mbedtls_sha256_init(&otaHash);mbedtls_sha256_starts(&otaHash,0);sendMessage(200,"Encrypted OTA ready");return;
 }
 if(!firmwareUploadActive||otaSession!=secureCurrent->id){sendMessage(409,"Firmware upload belongs to another session");return;}
 if(p=="/api/firmware/chunk"){
  String hex=server.arg("data");size_t n=hex.length()/2;uint8_t bytes[1024];uint32_t offset=server.arg("offset").toInt();
  if(n<1||n>sizeof(bytes)||offset!=firmwareUploadBytes||offset+n>otaExpected||!secureUnhex(hex,bytes,n)){sendMessage(409,"Unexpected firmware offset or chunk");return;}
  const uint16_t chip=FLIGHT_CONTROL_ENABLED?13:5;if(!offset&&(n<24||bytes[0]!=0xe9||uint16_t(bytes[12]|uint16_t(bytes[13])<<8)!=chip)){abortSecureOta();sendMessage(400,"Wrong firmware chip/profile header");return;}
  if(Update.write(bytes,n)!=n){abortSecureOta();sendMessage(503,"Flash write failed");return;}mbedtls_sha256_update(&otaHash,bytes,n);firmwareUploadBytes+=n;otaAt=millis();sendJson(200,"{\"ok\":true,\"offset\":"+String(firmwareUploadBytes)+"}");return;
 }
 if(p=="/api/firmware/end"){
  uint8_t hash[32];mbedtls_sha256_finish(&otaHash,hash);mbedtls_sha256_free(&otaHash);
  if(firmwareUploadBytes!=otaExpected||secureHex(hash,32)!=otaDigest){Update.abort();firmwareUploadActive=false;sendMessage(409,"Firmware size / SHA-256 mismatch; not activated");return;}
  if(!Update.end(false)){firmwareUploadActive=false;sendMessage(503,"Firmware validation failed");return;}
  firmwareUploadActive=false;sendMessage(200,"Firmware verified; rebooting");restartAt=millis()+1000;return;
 }
 sendMessage(404,"Unknown encrypted OTA step");
}
