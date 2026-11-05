#pragma once
#include <map>
#include <string>
class Preferences {std::map<std::string,String> values;public:
 bool failNextWrite=false;unsigned writes=0,failWriteAt=0,truncateWriteAt=0;
 unsigned mismatchAfterWrite=0;std::string mismatchKey;
 bool begin(const char*,bool){return true;}void end(){}void clear(){values.clear();}
 unsigned short getUShort(const char* k,unsigned short fallback=0){return values.count(k)?static_cast<unsigned short>(values[k].toInt()):fallback;}
 size_t putUShort(const char* k,unsigned short n){return putString(k,String(n))?2:0;}
 String getString(const char* k,String fallback=""){if(mismatchAfterWrite&&writes==mismatchAfterWrite&&mismatchKey==k){
  mismatchAfterWrite=0;return "readback-mismatch";
 }
 return values.count(k)?values[k]:String(fallback);}
 size_t putString(const char* k,const String& v){++writes;if(failNextWrite||writes==failWriteAt){failNextWrite=false;return 0;}
 if(writes==truncateWriteAt){values[k]=v.substring(0,v.length()/2);return v.length()/2;}
 values[k]=v;return v.length();}void remove(const char* k){values.erase(k);}
};
