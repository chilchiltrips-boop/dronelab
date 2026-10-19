package in.zebjus.dronelab.companion;
import android.app.Activity;
import android.webkit.WebView;
import android.net.Network;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.lang.reflect.Field;
import javax.crypto.*;
import javax.crypto.spec.*;

/** Real production sender + loopback encrypted Kit peer; no Android device claims. */
public final class UdpStreamInterop {
 static final String DEVICE="ZFC-A2-012345ABCDEF",CLAIM="11".repeat(16),KEY="22".repeat(32);
 static final byte[] key=new byte[32];
 static volatile boolean serving=true,mute=false,injectBad=true,oversizeOnly=false;
 static volatile Throwable peerFailure;
 static final List<byte[]> frames=new CopyOnWriteArrayList<>();
 static void require(boolean ok,String message){if(!ok)throw new AssertionError(message);}
 static byte[] crypto(boolean encrypt,byte[] header,byte[] body)throws Exception{
  Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
  c.init(encrypt?Cipher.ENCRYPT_MODE:Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Arrays.copyOfRange(header,16,28)));
  c.updateAAD(header,0,16);return c.doFinal(body);
 }
 static boolean has(WebView view,String marker){return view.events.stream().anyMatch(s->s.contains(marker));}
 static void waitFor(Activity activity,WebView view,String marker,FlightCoreUdpStream stream,boolean offer)throws Exception{
  long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(3);
  while(System.nanoTime()<until){
   activity.drain();if(has(view,marker))return;
   if(offer)stream.offer("1000,1500,1500,1500,1000,1000",true);
   Thread.sleep(10);
  }
  throw new AssertionError("Missing "+marker+" events="+view.events);
 }
 static void peer(DatagramSocket server){
  try{while(serving){
   byte[] packet=new byte[58];DatagramPacket p=new DatagramPacket(packet,58);
   try{server.receive(p);}catch(SocketTimeoutException empty){continue;}
   byte[] clear=crypto(false,packet,Arrays.copyOfRange(packet,28,58));frames.add(clear);
   if(mute)continue;
   byte[] ack=packet.clone();ack[2]='A';System.arraycopy(new byte[]{'K','I','T','!'},0,ack,24,4);
   byte[] body=new byte[14];System.arraycopy(packet,12,body,0,4);body[12]=(byte)(5+((clear[12]&1)==1?2:0));
   byte[] encoded=crypto(true,ack,body);System.arraycopy(encoded,0,ack,28,30);
   if(injectBad){byte[] bad=ack.clone();bad[57]^=1;server.send(new DatagramPacket(bad,58,p.getAddress(),p.getPort()));injectBad=false;}
   byte[] sent=oversizeOnly?Arrays.copyOf(ack,59):ack;
   server.send(new DatagramPacket(sent,sent.length,p.getAddress(),p.getPort()));
  }}catch(Throwable error){if(serving)peerFailure=error;}
 }
 public static void main(String[] args)throws Exception{
  Arrays.fill(key,(byte)0x22);Network.uiThread=Thread.currentThread();
  Activity activity=new Activity();WebView view=new WebView();FlightCoreWifiLink wifi=new FlightCoreWifiLink();
  FlightCoreUdpStream stream=new FlightCoreUdpStream(activity,view,wifi);
  DatagramSocket server=new DatagramSocket(4210,InetAddress.getLoopbackAddress());server.setSoTimeout(50);
  Thread peer=new Thread(()->peer(server));peer.start();
  try{
   stream.start("first","127.0.0.1",DEVICE,CLAIM,KEY);
   waitFor(activity,view,"\"type\":\"start\"",stream,false);
   waitFor(activity,view,"\"inputArmed\":true",stream,true);
   require(!has(view,"UDP_SEND_OR_AUTH_FAILED"),"A bad-tag ACK must not terminate the stream");
   require(Network.binds==1&&!frames.isEmpty(),"Worker must bind and transmit actual datagrams");
   stream.offer("1700,1600,1400,1800,1000,1000",true);Thread.sleep(35);stream.stop();
   int prior=view.events.size();activity.drain();
   require(prior==view.events.size(),"Stopped stream UI callbacks must be discarded");
   frames.clear();view.events.clear();
   stream.start("fresh","127.0.0.1",DEVICE,CLAIM,KEY);
   waitFor(activity,view,"\"type\":\"start\"",stream,false);
   long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(1);while(frames.isEmpty()&&System.nanoTime()<until)Thread.sleep(5);
   require(!frames.isEmpty()&&((frames.get(0)[0]&255)<<8|(frames.get(0)[1]&255))==1000&&frames.get(0)[12]==0,"Restart must begin neutral and disarmed");
   waitFor(activity,view,"UDP_INPUT_STALE",stream,false);stream.stop();
   view.events.clear();wifi.deny=true;stream.start("denied","127.0.0.1",DEVICE,CLAIM,KEY);
   waitFor(activity,view,"UDP_START_PINNED_NETWORK_NETWORK_IDENTITY",stream,false);
   require(has(view,"\"sent\":0")&&!has(view,"SSID/IP/secret"),"Startup failure must reset counters and expose only enums");
   stream.stop();wifi.deny=false;view.events.clear();
   Field field=FlightCoreUdpStream.class.getDeclaredField("sender");field.setAccessible(true);
   ScheduledExecutorService executor=(ScheduledExecutorService)field.get(stream);
   CountDownLatch entered=new CountDownLatch(1),resume=new CountDownLatch(1);
   executor.execute(()->{entered.countDown();try{resume.await();}catch(InterruptedException ignored){}});require(entered.await(1,TimeUnit.SECONDS),"worker blocked");
   int binds=Network.binds;stream.start("cancelled","127.0.0.1",DEVICE,CLAIM,KEY);stream.stop();resume.countDown();Thread.sleep(60);activity.drain();
   require(Network.binds==binds&&view.events.isEmpty(),"STOP must cancel a queued startup");
   stream.start("timeout","127.0.0.1",DEVICE,CLAIM,KEY);waitFor(activity,view,"\"inputArmed\":true",stream,true);
   oversizeOnly=true;waitFor(activity,view,"UDP_ACK_TIMEOUT",stream,true);
   require(peerFailure==null,"Encrypted Kit peer failed: "+peerFailure);
   System.out.println("PASS actual Android UDP stream: worker startup, encrypted ARM/ACK, bad ACK, neutral restart, STOP cancellation, input/ACK watchdogs");
  }finally{stream.shutdown();serving=false;server.close();peer.join(1000);}
 }
}
