#pragma once
// Encrypted, session-bound APP OTA. SHA-256 validates submitted bytes; publisher
// signing/secure boot is a separate production provisioning requirement.
static bool zjSecureOtaActive=false;
static uint32_t zjSecureOtaSize=0,zjSecureOtaOffset=0,zjSecureOtaAt=0;
static String zjSecureOtaSession,zjSecureOtaHash;
static mbedtls_sha256_context zjSecureOtaDigest;
static void zjSecureOtaAbort(){
 if(zjSecureOtaActive){Update.abort();mbedtls_sha256_free(&zjSecureOtaDigest);}
 zjSecureOtaActive=false;zjOtaAuthorized=false;zjSecureOtaSession="";zjSecureOtaOffset=0;
}
static bool zjSecureOtaAccess(bool owner=false){
 if(!zjAllow())return false;
 if(!zjAuthAdmin||zjRequestSession<0||!zjSessions[zjRequestSession].admin){zjReply(403,"{\"error\":\"usb_paired_encrypted_admin_required\"}");return false;}
 if(owner&&(!zjSecureOtaActive||zjSecureOtaSession!=zjSessions[zjRequestSession].id)){zjReply(409,"{\"error\":\"ota_session_mismatch\"}");return false;}
 return true;
}
static void zjSetupSecureOtaHttp(){
 zjHttp.on("/api/firmware/begin",HTTP_POST,[](){
  if(!zjSecureOtaAccess())return;
  if(zjRcOwned||zjNetTesting||zjUsbScanning||zjOtaAuthorized||zjOtaRebootAt){zjReply(409,"{\"error\":\"controller_or_network_busy\"}");return;}
  long size=0;String digest=zjArg("sha256");digest.toLowerCase();
  if(zjArg("boardId")!=FC_BOARD||!parseNumber(zjArg("size").c_str(),32768,0x1e0000,size)||!zjHex(digest,64)){zjReply(400,"{\"error\":\"invalid_ota_board_size_or_digest\"}");return;}
  if(!Update.begin(size,U_FLASH)){zjReply(400,"{\"error\":\"ota_partition_unavailable_use_usb_factory\"}");return;}
  mbedtls_sha256_init(&zjSecureOtaDigest);
  if(mbedtls_sha256_starts(&zjSecureOtaDigest,0)){Update.abort();mbedtls_sha256_free(&zjSecureOtaDigest);zjReply(500,"{\"error\":\"ota_digest_failed\"}");return;}
  zjSecureOtaActive=true;zjOtaAuthorized=true;zjSecureOtaSize=uint32_t(size);zjSecureOtaOffset=0;zjSecureOtaAt=millis();
  zjSecureOtaHash=digest;zjSecureOtaSession=zjSessions[zjRequestSession].id;
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"offset\":0}");
 });
 zjHttp.on("/api/firmware/chunk",HTTP_POST,[](){
  if(!zjSecureOtaAccess(true))return;
  long offset=0;const String data=zjArg("data");
  if(!parseNumber(zjArg("offset").c_str(),0,0x1e0000,offset)||uint32_t(offset)!=zjSecureOtaOffset||data.isEmpty()||data.length()>768||data.length()%2||!zjHex(data,data.length())||zjSecureOtaOffset+data.length()/2>zjSecureOtaSize){zjReply(409,"{\"error\":\"ota_offset_or_chunk_invalid\"}");return;}
  uint8_t bytes[384];const size_t size=data.length()/2;zjUnhex(data,bytes);
  if(zjSecureOtaOffset==0){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
   const uint16_t expected=13;
#else
   const uint16_t expected=5;
#endif
   const uint32_t descriptor=size>=36?uint32_t(bytes[32])|uint32_t(bytes[33])<<8|uint32_t(bytes[34])<<16|uint32_t(bytes[35])<<24:0;
   if(size<36||bytes[0]!=0xe9||bytes[1]<1||bytes[1]>16||(uint16_t(bytes[12])|uint16_t(bytes[13])<<8)!=expected||descriptor!=0xabcd5432){zjSecureOtaAbort();zjReply(400,"{\"error\":\"ota_requires_matching_app_image\"}");return;}
  }
  if(mbedtls_sha256_update(&zjSecureOtaDigest,bytes,size)||Update.write(bytes,size)!=size){zjSecureOtaAbort();zjReply(500,"{\"error\":\"ota_write_failed\"}");return;}
  zjSecureOtaOffset+=size;zjSecureOtaAt=millis();
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"offset\":"+String(zjSecureOtaOffset)+"}");
 });
 zjHttp.on("/api/firmware/end",HTTP_POST,[](){
  if(!zjSecureOtaAccess(true))return;
  uint8_t digest[32];
  if(zjSecureOtaOffset!=zjSecureOtaSize||mbedtls_sha256_finish(&zjSecureOtaDigest,digest)||!zjEqual(zjHexBytes(digest,32),zjSecureOtaHash)){zjSecureOtaAbort();zjReply(400,"{\"error\":\"ota_size_or_sha256_mismatch\"}");return;}
  if(!Update.end(true)){zjSecureOtaAbort();zjReply(400,"{\"error\":\"ota_final_verification_failed\"}");return;}
  mbedtls_sha256_free(&zjSecureOtaDigest);zjSecureOtaActive=false;zjOtaAuthorized=false;zjOtaRebootAt=millis()+1200;
  zjReply(200,"{\"kitId\":"+zjJson(zjKitId)+",\"updated\":true,\"rebooting\":true,\"sha256\":"+zjJson(zjSecureOtaHash)+"}");
 });
 zjHttp.on("/api/firmware/abort",HTTP_POST,[](){if(!zjSecureOtaAccess(true))return;zjSecureOtaAbort();zjReply(200,"{\"aborted\":true}");});
}
static void zjSecureOtaLoop(uint32_t now){if(zjSecureOtaActive&&uint32_t(now-zjSecureOtaAt)>30000)zjSecureOtaAbort();}
