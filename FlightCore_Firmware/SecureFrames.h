#pragma once
#include <stdint.h>
#include <string.h>
#include <mbedtls/gcm.h>
#include <mbedtls/hkdf.h>
#include <mbedtls/sha256.h>
namespace ZfcSecure {
// Authenticate before updating a window: an attacker cannot advance it with a forged tag.
struct ReplayWindow {
 uint64_t high=0,bits=0;
 bool allowed(uint64_t n) const {return n && (n>high || high-n<64 && !(bits&(uint64_t(1)<<(high-n))));}
 void accept(uint64_t n){if(n>high){uint64_t d=n-high;bits=d>=64?1:(bits<<d)|1;high=n;}else bits|=uint64_t(1)<<(high-n);}
};
inline void nonce(uint64_t n,uint8_t out[12]){memset(out,0,12);for(int i=0;i<8;i++)out[11-i]=uint8_t(n>>(i*8));}
inline bool seal(const uint8_t key[32],uint64_t sequence,const uint8_t* aad,size_t a,const uint8_t* in,size_t n,uint8_t* out){
 uint8_t iv[12];nonce(sequence,iv);mbedtls_gcm_context c;mbedtls_gcm_init(&c);
 int r=mbedtls_gcm_setkey(&c,MBEDTLS_CIPHER_ID_AES,key,256);
 if(!r)r=mbedtls_gcm_crypt_and_tag(&c,MBEDTLS_GCM_ENCRYPT,n,iv,12,aad,a,in,out,16,out+n);
 mbedtls_gcm_free(&c);return r==0;
}
inline bool open(const uint8_t key[32],uint64_t sequence,const uint8_t* aad,size_t a,const uint8_t* in,size_t n,uint8_t* out){
 if(n<16)return false;uint8_t iv[12];nonce(sequence,iv);mbedtls_gcm_context c;mbedtls_gcm_init(&c);
 int r=mbedtls_gcm_setkey(&c,MBEDTLS_CIPHER_ID_AES,key,256);
 if(!r)r=mbedtls_gcm_auth_decrypt(&c,n-16,iv,12,aad,a,in+n-16,16,in,out);
 mbedtls_gcm_free(&c);return r==0;
}
}
