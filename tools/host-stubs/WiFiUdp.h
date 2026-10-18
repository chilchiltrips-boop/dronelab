#pragma once
// Host-only POSIX socket adapter. Production builds use Espressif WiFiUDP.
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <fcntl.h>
#include <vector>
static uint16_t testRpcPort=0;static int testDropReplies=0;
class WiFiUDP {
 int fd=-1;std::vector<uint8_t> pending,outgoing;uint16_t sourcePort=0,destinationPort=0;
 public:
 bool begin(uint16_t){
  fd=socket(AF_INET,SOCK_DGRAM,0);sockaddr_in addr{};addr.sin_family=AF_INET;addr.sin_addr.s_addr=htonl(INADDR_LOOPBACK);addr.sin_port=htons(testRpcPort);
  if(bind(fd,(sockaddr*)&addr,sizeof(addr)))return false;fcntl(fd,F_SETFL,O_NONBLOCK);
  socklen_t size=sizeof(addr);getsockname(fd,(sockaddr*)&addr,&size);testRpcPort=ntohs(addr.sin_port);return true;
 }
 int parsePacket(){
  if(!pending.empty())return pending.size();uint8_t data[2000];sockaddr_in addr{};socklen_t size=sizeof(addr);
  const int n=recvfrom(fd,data,sizeof(data),0,(sockaddr*)&addr,&size);if(n<=0)return 0;
  pending.assign(data,data+n);sourcePort=ntohs(addr.sin_port);return n;
 }
 int available(){return pending.size();}int read(){if(pending.empty())return -1;const int b=pending.front();pending.erase(pending.begin());return b;}
 int read(uint8_t* p,size_t n){n=std::min(n,pending.size());memcpy(p,pending.data(),n);pending.erase(pending.begin(),pending.begin()+n);return n;}
 IPAddress remoteIP(){return IPAddress(192,168,4,2);}uint16_t remotePort(){return sourcePort;}
 int beginPacket(IPAddress,uint16_t port){destinationPort=port;outgoing.clear();return 1;}
 size_t write(const uint8_t* p,size_t n){outgoing.insert(outgoing.end(),p,p+n);return n;}
 int endPacket(){
  if(testDropReplies>0){testDropReplies--;return 1;}
  sockaddr_in addr{};addr.sin_family=AF_INET;addr.sin_addr.s_addr=htonl(INADDR_LOOPBACK);addr.sin_port=htons(destinationPort);
  return sendto(fd,outgoing.data(),outgoing.size(),0,(sockaddr*)&addr,sizeof(addr))>=0;
 }
};
