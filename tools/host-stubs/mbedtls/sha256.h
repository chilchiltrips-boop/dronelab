#pragma once
#include <openssl/sha.h>
#include <openssl/evp.h>
struct mbedtls_sha256_context {EVP_MD_CTX* value=nullptr;};
inline void mbedtls_sha256_init(mbedtls_sha256_context* c){c->value=EVP_MD_CTX_new();}
inline void mbedtls_sha256_free(mbedtls_sha256_context* c){EVP_MD_CTX_free(c->value);c->value=nullptr;}
inline int mbedtls_sha256_starts(mbedtls_sha256_context* c,int){return EVP_DigestInit_ex(c->value,EVP_sha256(),nullptr)==1?0:-1;}
inline int mbedtls_sha256_update(mbedtls_sha256_context* c,const unsigned char* p,size_t n){return EVP_DigestUpdate(c->value,p,n)==1?0:-1;}
inline int mbedtls_sha256_finish(mbedtls_sha256_context* c,unsigned char* out){unsigned n=0;return EVP_DigestFinal_ex(c->value,out,&n)==1&&n==32?0:-1;}
inline int mbedtls_sha256(const unsigned char* p,size_t n,unsigned char* out,int){SHA256(p,n,out);return 0;}
