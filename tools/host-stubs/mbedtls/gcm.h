#pragma once
#include <openssl/evp.h>
#define MBEDTLS_CIPHER_ID_AES 1
#define MBEDTLS_GCM_ENCRYPT 1
struct mbedtls_gcm_context {unsigned char key[32];};
inline void mbedtls_gcm_init(mbedtls_gcm_context*){}inline void mbedtls_gcm_free(mbedtls_gcm_context*){}
inline int mbedtls_gcm_setkey(mbedtls_gcm_context* c,int,const unsigned char* k,int bits){memcpy(c->key,k,bits/8);return 0;}
inline int mbedtls_gcm_crypt_and_tag(mbedtls_gcm_context* c,int,size_t n,const unsigned char* iv,size_t ivn,const unsigned char* aad,size_t an,const unsigned char* in,unsigned char* out,size_t tn,unsigned char* tag){
 auto ctx=EVP_CIPHER_CTX_new();int len=0,written=0,ok=EVP_EncryptInit_ex(ctx,EVP_aes_256_gcm(),nullptr,nullptr,nullptr);
 ok&=EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_GCM_SET_IVLEN,ivn,nullptr);ok&=EVP_EncryptInit_ex(ctx,nullptr,nullptr,c->key,iv);
 if(an)ok&=EVP_EncryptUpdate(ctx,nullptr,&len,aad,an);ok&=EVP_EncryptUpdate(ctx,out,&len,in,n);written=len;
 ok&=EVP_EncryptFinal_ex(ctx,out+written,&len);ok&=EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_GCM_GET_TAG,tn,tag);EVP_CIPHER_CTX_free(ctx);return ok?0:-1;
}
inline int mbedtls_gcm_auth_decrypt(mbedtls_gcm_context* c,size_t n,const unsigned char* iv,size_t ivn,const unsigned char* aad,size_t an,const unsigned char* tag,size_t tn,const unsigned char* in,unsigned char* out){
 auto ctx=EVP_CIPHER_CTX_new();int len=0,ok=EVP_DecryptInit_ex(ctx,EVP_aes_256_gcm(),nullptr,nullptr,nullptr);
 ok&=EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_GCM_SET_IVLEN,ivn,nullptr);ok&=EVP_DecryptInit_ex(ctx,nullptr,nullptr,c->key,iv);
 if(an)ok&=EVP_DecryptUpdate(ctx,nullptr,&len,aad,an);ok&=EVP_DecryptUpdate(ctx,out,&len,in,n);
 ok&=EVP_CIPHER_CTX_ctrl(ctx,EVP_CTRL_GCM_SET_TAG,tn,const_cast<unsigned char*>(tag));ok&=EVP_DecryptFinal_ex(ctx,out+len,&len);EVP_CIPHER_CTX_free(ctx);return ok?0:-1;
}
