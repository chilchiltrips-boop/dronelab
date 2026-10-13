#pragma once
#include <map>
#include <string>
class Preferences {std::map<std::string,String> values;public:
 bool failNextWrite=false;
 bool begin(const char*,bool){return true;}void end(){}void clear(){values.clear();}
 String getString(const char* k,String fallback=""){return values.count(k)?values[k]:String(fallback);}
 size_t putString(const char* k,const String& v){if(failNextWrite){failNextWrite=false;return 0;}values[k]=v;return v.length();}void remove(const char* k){values.erase(k);}
};
