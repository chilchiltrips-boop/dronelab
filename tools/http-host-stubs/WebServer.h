#pragma once
#include "ArduinoShim.h"
#include <memory>
#include <deque>
#include <sys/socket.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <unistd.h>
using PGM_P=const char*;
enum HTTPMethod {HTTP_GET=1,HTTP_POST=2};
enum HTTPClientStatus {HC_NONE,HC_WAIT_READ};
static constexpr int WL_CONNECTED=3;
struct {int status(){return WL_CONNECTED;}IPAddress localIP(){return IPAddress(192,168,1,70);}IPAddress softAPIP(){return IPAddress(192,168,4,1);}} WiFi;
class NetworkClient {
 struct State {int fd;explicit State(int f):fd(f){}~State(){close(fd);}};std::shared_ptr<State> state;
 public:
 NetworkClient(){}explicit NetworkClient(int f):state(std::make_shared<State>(f)){}
 explicit operator bool()const{return bool(state);}int fd(){return state?state->fd:-1;}
 void stop(){if(state)shutdown(state->fd,SHUT_RDWR);state.reset();}
 IPAddress remoteIP(){return IPAddress(192,168,4,2);}IPAddress localIP(){return IPAddress(192,168,4,1);}
};
static std::deque<NetworkClient> accepted;static int parserCalls=0;
struct NetworkServer {NetworkClient accept(){if(accepted.empty())return {};auto c=accepted.front();accepted.pop_front();return c;}};
class WebServer {
 std::function<void()> handler;
 protected:
 NetworkServer _server;NetworkClient _currentClient;HTTPClientStatus _currentStatus=HC_NONE;uint32_t _statusChange=0;
 virtual size_t _currentClientWrite(const char* p,size_t n){return ::send(_currentClient.fd(),p,n,MSG_DONTWAIT);}
 virtual size_t _currentClientWrite_P(PGM_P p,size_t n){return _currentClientWrite(p,n);}
 public:
 explicit WebServer(int){}virtual ~WebServer(){}
 virtual void handleClient(){++parserCalls;char request[12000];recv(_currentClient.fd(),request,sizeof(request),MSG_DONTWAIT);if(handler)handler();_currentClient={};_currentStatus=HC_NONE;}
 virtual NetworkClient& client(){return _currentClient;}
 void on(const char*,HTTPMethod,std::function<void()> f){handler=f;}
 void on(const char*,HTTPMethod,std::function<void()> f,std::function<void()>){handler=f;}
 String uri(){return "/api/status";}HTTPMethod method(){return HTTP_GET;}String arg(const String&){return "";}String header(const String&){return "";}
 void sendHeader(const String&,const String&,bool=false){}
 void send(int,const char*,const String& body){_currentClientWrite("HTTP/1.1 200 OK\r\n\r\n",19);_currentClientWrite(body.c_str(),body.length());}
};
