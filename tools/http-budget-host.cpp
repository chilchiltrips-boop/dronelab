#define ARDUINO 10819
#include "host-stubs/ArduinoShim.h"
#include <WebServer.h>
#include <cassert>
#include <iostream>
#include "../FlightCore_Firmware/FlightCoreRpc.h"
static int openPeer(){int sockets[2];assert(socketpair(AF_UNIX,SOCK_STREAM,0,sockets)==0);fcntl(sockets[1],F_SETFL,O_NONBLOCK);accepted.emplace_back(sockets[0]);return sockets[1];}
static void put(int peer,const char* text){assert(::send(peer,text,strlen(text),0)==int(strlen(text)));}
int main(){
 const char* complete="POST /api/status HTTP/1.1\r\nContent-Length: 4\r\n\r\n1234";
 assert(zjHttpRequestLength(complete,strlen(complete))==int(strlen(complete)));
 for(const char* bad:{"GET / HTTP/1.1\r\nContent-Length: -1\r\n\r\n","GET / HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 1\r\n\r\n","GET / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n","GET / HTTP/1.1\r\nContent-Length: 999999999999999999999\r\n\r\n"})assert(zjHttpRequestLength(bad,strlen(bad))==-1);
 ZjNetworkServer server(80);server.controlActive=[](){return true;};server.on("/api/status",HTTP_GET,[&](){server.send(200,"text/plain",String(std::string(1800,'x')));});
 int peer=openPeer();put(peer,"GET /api/status HTTP/1.1\r\nHo");server.handleClient();server.handleClient();assert(parserCalls==0&&server.httpDeferred==2);
 put(peer,"st: kit\r\n\r\n");server.handleClient();assert(parserCalls==1);
 char reply[2000];assert(recv(peer,reply,sizeof(reply),0)<0);server.handleClient();assert(recv(peer,reply,sizeof(reply),0)==1024);
 server.handleClient();assert(recv(peer,reply,sizeof(reply),0)==795);close(peer);
 peer=openPeer();put(peer,"POST /api/status HTTP/1.1\r\nContent-Length: 4\r\n\r\n123");server.handleClient();assert(parserCalls==1);
 clockMs+=501;server.handleClient();assert(server.httpDropped==1&&parserCalls==1);close(peer);
 peer=openPeer();put(peer,"GET / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n");server.handleClient();assert(server.httpDropped==2&&parserCalls==1);close(peer);
 // Queued slow-reader responses have a fixed lifetime as well as a byte cap.
 peer=openPeer();put(peer,"GET /api/status HTTP/1.1\r\n\r\n");server.handleClient();clockMs+=501;server.handleClient();assert(server.httpDropped==3);close(peer);
 std::cout<<"PASS production HTTP control boundary: partial headers/body deferred, malformed framing rejected, bounded response chunks and expiry\n";
}
