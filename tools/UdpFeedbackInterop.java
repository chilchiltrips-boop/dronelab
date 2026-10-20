package in.zebjus.dronelab.companion;
import android.app.Activity;
import android.webkit.WebView;
import android.net.Network;
import java.net.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Production Android sender against an encrypted v2 feedback peer. */
public final class UdpFeedbackInterop {
 static final String DEVICE="ZFC-A2-012345ABCDEF",CLAIM="11".repeat(16),KEY="22".repeat(32);
 static final byte[] key=new byte[32];
 static volatile boolean serving=true,apply=true,staleOnce=false,oversize=false,replay=false,seenArmed=false;
 static volatile int forceReason=0,totalInputs=0;
 static volatile boolean mute=false;
 static volatile Throwable failure;
 static int rx=0,applied=0,received=0,appliedCount=0,counter=0,salt=80;
 static long rxAt=0,appliedAt=0;
 static boolean appliedArm=false;
 static byte[] lastReply,prefix;
 static void require(boolean value,String why){if(!value)throw new AssertionError(why);}
 static int u32(byte[] b,int at){return ((b[at]&255)<<24)|((b[at+1]&255)<<16)|((b[at+2]&255)<<8)|(b[at+3]&255);}
 static void put32(byte[] b,int at,int n){b[at]=(byte)(n>>>24);b[at+1]=(byte)(n>>>16);b[at+2]=(byte)(n>>>8);b[at+3]=(byte)n;}
 static void put16(byte[] b,int at,int n){b[at]=(byte)(n>>>8);b[at+1]=(byte)n;}
 static long now(){return System.nanoTime()/1000000;}
 static byte[] crypto(boolean encrypt,byte[] header,byte[] body)throws Exception{
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(encrypt?Cipher.ENCRYPT_MODE:Cipher.DECRYPT_MODE,
   new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Arrays.copyOfRange(header,16,28)));
  c.updateAAD(header,0,16);return c.doFinal(body);
 }
 static void reply(DatagramSocket server,DatagramPacket target,byte[] request,int echo,int kind,int reason,boolean terminal)throws Exception{
  byte[] out=new byte[72],body=new byte[28];System.arraycopy(request,0,out,0,16);
  out[2]='A';out[3]='2';put32(out,12,echo);put32(out,16,salt);put32(out,20,++counter);
  System.arraycopy(new byte[]{'F','B','K','2'},0,out,24,4);
  put32(body,0,rx);put32(body,4,applied);put16(body,8,rx==0?65535:(int)Math.min(65534,now()-rxAt));
  put16(body,10,applied==0?65535:(int)Math.min(65534,now()-appliedAt));
  put32(body,12,received);put32(body,16,appliedCount);put32(body,20,reason==0?0:1);
  body[24]=(byte)((rx>0?1:0)|(appliedArm?2:0)|4|(applied>0?8:0)|(terminal?16:0));
  body[25]=(byte)kind;body[26]=(byte)reason;
  System.arraycopy(crypto(true,out,body),0,out,28,44);lastReply=out;
  byte[] sent=oversize?Arrays.copyOf(out,73):out;
  server.send(new DatagramPacket(sent,sent.length,target.getAddress(),target.getPort()));
 }
 static void peer(DatagramSocket server){
  try{while(serving){
   byte[] packet=new byte[58];DatagramPacket in=new DatagramPacket(packet,packet.length);
   try{server.receive(in);}catch(SocketTimeoutException empty){continue;}
   byte[] next=Arrays.copyOfRange(packet,16,20);
   if(!Arrays.equals(prefix,next)){prefix=next;rx=applied=received=appliedCount=counter=0;rxAt=appliedAt=0;appliedArm=false;lastReply=null;salt++;}
   int seq=u32(packet,12);byte[] body=crypto(false,packet,Arrays.copyOfRange(packet,28,58));
   seenArmed|=(body[12]&1)!=0;totalInputs++;
   if(mute)continue;
   if(replay&&lastReply!=null){server.send(new DatagramPacket(lastReply,lastReply.length,in.getAddress(),in.getPort()));continue;}
   if(forceReason!=0){reply(server,in,packet,seq,3,forceReason,true);continue;}
   if(staleOnce&&rx>0){staleOnce=false;reply(server,in,packet,rx,3,2,false);}
   require(seq==rx+1,"Joystick packets must advance without retransmitting old sequences");
   rx=seq;rxAt=now();received++;
   reply(server,in,packet,seq,1,0,false);
   if(apply){applied=seq;appliedAt=now();appliedCount++;appliedArm=(body[12]&1)!=0;reply(server,in,packet,seq,2,0,false);}
  }}catch(Throwable error){if(serving)failure=error;}
 }
 static boolean has(WebView view,String text){return view.events.stream().anyMatch(s->s.contains(text));}
 static void waitFor(Activity activity,WebView view,String text,FlightCoreUdpStream stream)throws Exception{
  long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
  while(System.nanoTime()<end){activity.drain();if(has(view,text))return;require(failure==null,"Peer failed: "+failure);
   stream.offer("1000,1500,1500,1500,1000,1000",true);Thread.sleep(10);}
  throw new AssertionError("Missing "+text+": "+view.events);
 }
 static void pump(Activity activity,WebView view,FlightCoreUdpStream stream,long duration)throws Exception{
  int before=totalInputs;long until=now()+duration;
  while(now()<until){
   stream.offer("1000,1500,1500,1500,1000,1000",true);activity.drain();
   require(failure==null,"Peer failed: "+failure);
   require(!has(view,"\"type\":\"error\""),"AP stream stopped on feedback: "+view.events);
   Thread.sleep(10);
  }
  activity.drain();require(totalInputs-before>=duration/40,"AP sender must keep transmitting new encrypted input");
 }
 static void waitWithoutInput(Activity activity,WebView view,String marker)throws Exception{
  long until=now()+3000;
  while(now()<until){activity.drain();if(has(view,marker))return;Thread.sleep(10);}
  throw new AssertionError("Missing "+marker+": "+view.events);
 }
 static FlightCoreUdpStream start(Activity activity,WebView view,String id){
  FlightCoreUdpStream stream=new FlightCoreUdpStream(activity,view,new FlightCoreWifiLink());
  stream.start(id,"127.0.0.1",DEVICE,CLAIM,KEY,2);return stream;
 }
 public static void main(String[] args)throws Exception{
  Arrays.fill(key,(byte)0x22);Network.uiThread=Thread.currentThread();
  byte[] warm=new byte[58];crypto(false,warm,crypto(true,warm,new byte[28]));
  DatagramSocket server=new DatagramSocket(4210,InetAddress.getLoopbackAddress());server.setSoTimeout(50);
  Thread worker=new Thread(()->peer(server));worker.start();
  FlightCoreUdpStream stream=null;
  try{
   Activity activity=new Activity();WebView view=new WebView();apply=false;
   stream=start(activity,view,"rx_only");waitFor(activity,view,"\"ackKind\":\"RX_ACK\"",stream);
   require(!has(view,"\"inputArmed\":true"),"RX alone must never confirm applied ARM");
   apply=true;waitFor(activity,view,"\"inputArmed\":true",stream);
   require(has(view,"\"appliedKnown\":true")&&has(view,"\"lastAppliedSeq\":"),"Applied confirmation must be explicit");
   staleOnce=true;waitFor(activity,view,"\"nackReason\":\"STALE\"",stream);
   require(!has(view,"\"type\":\"error\""),"Reordered STALE NACK must keep control alive");
   apply=false;waitFor(activity,view,"UDP_FIRMWARE_APPLY_STALE",stream);stream.shutdown();
   activity=new Activity();view=new WebView();apply=true;oversize=false;replay=false;
   stream=start(activity,view,"oversized");waitFor(activity,view,"\"inputArmed\":true",stream);
   oversize=true;waitFor(activity,view,"UDP_ACK_TIMEOUT",stream);stream.shutdown();
   activity=new Activity();view=new WebView();oversize=false;
   stream=start(activity,view,"replayed");waitFor(activity,view,"\"inputArmed\":true",stream);
   replay=true;waitFor(activity,view,"UDP_ACK_TIMEOUT",stream);stream.shutdown();replay=false;
   final String[] reasons={"NONE","INVALID_FRAME","STALE","OWNER_CONFLICT","APPLY_STALLED","AUTH_EXPIRED"};
   for(int reason:new int[]{1,3,4,5}){
    activity=new Activity();view=new WebView();forceReason=reason;
    stream=start(activity,view,"nack_"+reason);waitFor(activity,view,"UDP_NACK_"+reasons[reason],stream);
    require(!has(view,"\"inputArmed\":true"),"Terminal NACK cannot ARM");stream.shutdown();
   }
   forceReason=0;mute=true;oversize=replay=false;
   for(int version:new int[]{1,2}){
    activity=new Activity();view=new WebView();
    stream=new FlightCoreUdpStream(activity,view,new FlightCoreWifiLink());
    stream.start("ap_silent_"+version,"127.0.0.1",DEVICE,CLAIM,KEY,version,true);
    waitFor(activity,view,"\"type\":\"start\"",stream);
    pump(activity,view,stream,1200);
    require(has(view,"\"ackRequired\":false")&&has(view,"\"type\":\"tx\""),"AP reports local sends and optional ACK policy");
    require(!has(view,"\"inputArmed\":true"),"Local AP sends cannot invent firmware ARM confirmation");
    waitWithoutInput(activity,view,"UDP_INPUT_STALE");stream.shutdown();
   }
   mute=false;apply=true;
   activity=new Activity();view=new WebView();
   stream=new FlightCoreUdpStream(activity,view,new FlightCoreWifiLink());
   stream.start("ap_delayed","127.0.0.1",DEVICE,CLAIM,KEY,2,true);
   waitFor(activity,view,"\"inputArmed\":true",stream);
   oversize=true;pump(activity,view,stream,1100);oversize=false;
   stream.shutdown();
   activity=new Activity();view=new WebView();
   stream=new FlightCoreUdpStream(activity,view,new FlightCoreWifiLink());
   stream.start("ap_replay","127.0.0.1",DEVICE,CLAIM,KEY,2,true);
   waitFor(activity,view,"\"inputArmed\":true",stream);
   replay=true;pump(activity,view,stream,1100);stream.shutdown();replay=false;
   activity=new Activity();view=new WebView();apply=false;
   stream=new FlightCoreUdpStream(activity,view,new FlightCoreWifiLink());
   stream.start("ap_rx_only","127.0.0.1",DEVICE,CLAIM,KEY,2,true);
   waitFor(activity,view,"\"ackKind\":\"RX_ACK\"",stream);
   pump(activity,view,stream,1100);
   require(!has(view,"\"inputArmed\":true"),"RX-only telemetry is not applied ARM");
   forceReason=4;waitFor(activity,view,"UDP_NACK_APPLY_STALLED",stream);
   stream.shutdown();forceReason=0;
   require(failure==null,"Peer failed: "+failure);
   System.out.println("PASS production Android feedback v2: AP silent/delayed/replayed/RX-only streaming, local-input expiry, terminal NACK,  RX/APPLIED separation, ages, NACKs, replay/size checks, receive/apply watchdogs, no retransmission");
  }finally{if(stream!=null)stream.shutdown();serving=false;server.close();worker.join(1000);}
 }
}
