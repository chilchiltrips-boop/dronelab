#pragma once
#include <string>
#include <cstring>
#include <cstdlib>
#include <cstdint>
#include <cstdio>
#include <cctype>
#include <functional>
#include <map>
#include <type_traits>
#include <sstream>
#include <iomanip>
class String {std::string v;public:
 String(){}String(const char* p):v(p?p:""){}String(const std::string& p):v(p){}String(char c):v(1,c){}
 template<class T,typename=std::enable_if_t<std::is_arithmetic_v<T>>>String(T n):v(std::to_string(n)){}
 String(float n,int precision){std::ostringstream out;out<<std::fixed<<std::setprecision(precision)<<n;v=out.str();}
 size_t length()const{return v.size();}bool isEmpty()const{return v.empty();}const char* c_str()const{return v.c_str();}char operator[](size_t i)const{return v[i];}
 String substring(size_t a,size_t b=std::string::npos)const{return v.substr(a,b==std::string::npos?b:b-a);}int indexOf(char c,size_t at=0)const{auto n=v.find(c,at);return n==std::string::npos?-1:n;}
 void toLowerCase(){for(auto& c:v)c=std::tolower(c);}
 void reserve(size_t n){v.reserve(n);}void toCharArray(char* p,size_t n)const{snprintf(p,n,"%s",v.c_str());}long toInt()const{return strtol(v.c_str(),nullptr,10);}
 bool startsWith(const char* s)const{return v.rfind(s,0)==0;}
 String& operator+=(const String& b){v+=b.v;return *this;}friend String operator+(const String&a,const String&b){return a.v+b.v;}
 friend bool operator==(const String&a,const String&b){return a.v==b.v;}friend bool operator!=(const String&a,const String&b){return !(a==b);}friend bool operator<(const String&a,const String&b){return a.v<b.v;}
};
struct IPAddress {uint32_t value;IPAddress(uint32_t v=0):value(v){}IPAddress(int a,int b,int c,int d):value((a<<24)|(b<<16)|(c<<8)|d){}uint8_t operator[](int i)const{return value>>((3-i)*8);}String toString()const{return String((*this)[0])+"."+String((*this)[1])+"."+String((*this)[2])+"."+String((*this)[3]);}friend bool operator==(IPAddress a,IPAddress b){return a.value==b.value;}friend bool operator!=(IPAddress a,IPAddress b){return !(a==b);}};
static uint32_t clockMs=0,randomValue=200;static uint32_t millis(){return clockMs;}#ifndef ZJ_SHIM_EXTERNAL_MICROS
static uint32_t micros(){return clockMs*1000UL;}
#endifstatic uint32_t esp_random(){return ++randomValue;}
struct {uint64_t getEfuseMac(){return 0x123456abcdefULL;}} ESP;
struct {int availableForWrite(){return 512;}template<class... T>void print(T...){}template<class... T>void println(T...){}template<class... T>void printf(T...){} } Serial;
const char* FC_BOARD="ZFC-A1",*FC_LABEL="TEST KIT";
static bool parseNumber(const char* s,long lo,long hi,long& n){if(!s||!*s)return false;char* end;n=strtol(s,&end,10);return !*end&&n>=lo&&n<=hi;}
