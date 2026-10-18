package in.zebjus.dronelab.companion;

import android.app.Activity;
import android.net.Network;
import android.os.SystemClock;
import android.webkit.WebView;
import org.json.JSONObject;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** ZJUDP1: diagnostic input only. Physical motors stay firmware-disabled.
 *   58B encrypted frame / 58B encrypted ACK; separate from signed HTTP worker.
 *   Index 0..5 = T/R/P/Y/AUX1/AUX2; index 6 = input-arm flag (bit 0).
 */
final class FlightCoreUdpStream {
    static final int PORT=4210, PACKET=58;
    private final Activity activity;
    private final WebView view;
    private final FlightCoreWifiLink wifiLink;
    private final ScheduledExecutorService sender=Executors.newSingleThreadScheduledExecutor();
    private final SecureRandom random=new SecureRandom();
    private ScheduledFuture<?> timer;
    private DatagramSocket socket;
    private byte[] key, token, prefix;
    private boolean active, inputArm, acknowledgedArm;
    private long lastInputAt, lastAckAt, lastUiAt, sent, ackCount, estimatedLost, lastRtt, jitter;
    private int sequence, lastAckSequence, accepted, rejected;
    private final long[] sendTimes=new long[128];
    private final int[] channels={1000,1500,1500,1500,1000,1000};
    FlightCoreUdpStream(Activity activity,WebView view,FlightCoreWifiLink wifiLink){
        this.activity=activity;this.view=view;this.wifiLink=wifiLink;
    }
    private static byte[] hex(String value){
        if(value==null||value.length()%2!=0)throw new IllegalArgumentException("Invalid UDP key");
        byte[] b=new byte[value.length()/2];
        for(int i=0;i<b.length;i++){
            int v=Character.digit(value.charAt(i*2),16),w=Character.digit(value.charAt(i*2+1),16);
            if(v<0||w<0)throw new IllegalArgumentException("Invalid UDP key");
            b[i]=(byte)((v<<4)|w);
        }return b;
    }
    private static int get32(byte[] b,int n){
        return ((b[n]&255)<<24)|((b[n+1]&255)<<16)|((b[n+2]&255)<<8)|(b[n+3]&255);
    }
    private static void put32(byte[] b,int n,int v){
        b[n]=(byte)(v>>>24);b[n+1]=(byte)(v>>>16);b[n+2]=(byte)(v>>>8);b[n+3]=(byte)v;
    }
    private static byte[] cipher(boolean encrypt,byte[] key,byte[] packet,byte[] data)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");
        c.init(encrypt?Cipher.ENCRYPT_MODE:Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),
                new GCMParameterSpec(128,Arrays.copyOfRange(packet,16,28)));
        c.updateAAD(packet,0,16);
        return c.doFinal(data);
    }
    private void report(String type,String reason) {
        try{
            JSONObject o=new JSONObject();
            o.put("type",type);
            o.put("ok",!"error".equals(type));
            o.put("seq",lastAckSequence);
            o.put("sent",sent);o.put("ackReceived",ackCount);
            o.put("lost",estimatedLost);o.put("rejected",rejected);o.put("accepted",accepted);
            o.put("roundTripMs",lastRtt);o.put("jitterMs",jitter);
            o.put("lastPacketAgeMs",lastAckAt==0?-1:SystemClock.elapsedRealtime()-lastAckAt);
            o.put("inputArmed",acknowledgedArm);o.put("motorsArmed",false);
            if(reason!=null)o.put("reason",reason);
            String script="window.zebjusNativeUdpEvent && window.zebjusNativeUdpEvent("+o.toString()+")";
            activity.runOnUiThread(()->{
                if(view.getParent()!=null)view.evaluateJavascript(script,null);
            });
        }catch(Exception ignored){}
    }
    private void clear(){
        active=false;
        if(timer!=null){timer.cancel(false);timer=null;}
        if(socket!=null){socket.close();socket=null;}
        if(key!=null)Arrays.fill(key,(byte)0);
        if(prefix!=null)Arrays.fill(prefix,(byte)0);
        if(token!=null)Arrays.fill(token,(byte)0);
        key=token=prefix=null;
        sequence=0;inputArm=acknowledgedArm=false;lastInputAt=0;lastAckAt=0;
    }
    synchronized void stop(){clear();}
    synchronized void start(String id,String ip,String device,String claim,String keyHex){
        clear();
        if(id==null||!id.matches("[a-zA-Z0-9_-]{1,32}")||
           !device.matches("ZFC-A[12]-[A-F0-9]{12}")||
           !claim.matches("[a-fA-F0-9]{32}")||!keyHex.matches("[a-fA-F0-9]{64}")){
            report("error","UDP_SESSION_INVALID");return;
        }
        try{
            Network net=wifiLink.networkFor(ip,false);
            if(!wifiLink.isPinnedTo(device))throw new IllegalStateException("UDP_KIT_NOT_PINNED");
            byte[] secret=hex(keyHex),claimToken=hex(claim.substring(0,16));
            DatagramSocket ds=new DatagramSocket();
            try{
                net.bindSocket(ds);
                ds.connect(InetAddress.getByName(ip),PORT);
                ds.setSoTimeout(1);
            }catch(Exception e){ds.close();throw e;}
            key=secret;token=claimToken;prefix=new byte[4];random.nextBytes(prefix);
            socket=ds;active=true;
            sent=ackCount=estimatedLost=lastRtt=jitter=0;
            lastAckAt=lastUiAt=0;sequence=lastAckSequence=accepted=rejected=0;
            lastInputAt=SystemClock.elapsedRealtime();
            // The native publisher is scheduled independently of all HTTP requests.
            timer=sender.scheduleAtFixedRate(this::tick,0,20,TimeUnit.MILLISECONDS);
            report("start",null);
        }catch(Exception error){clear();report("error","UDP_START_FAILED");}
    }
    synchronized void offer(String csv,boolean armed){
        if(!active)return;
        if(csv==null||csv.length()>35)return;
        String[] v=csv.split(",",-1);
        if(v.length!=6)return;
        int[] next=new int[6];
        try{
            for(int i=0;i<6;i++){
                next[i]=Integer.parseInt(v[i]);
                if(next[i]<1000||next[i]>2000)return;
            }
        }catch(NumberFormatException invalid){return;}
        if(armed&&!inputArm&&next[0]>1050)return;
        System.arraycopy(next,0,channels,0,6);
        inputArm=armed;lastInputAt=SystemClock.elapsedRealtime();
    }
    private synchronized void tick(){
        if(!active)return;
        final long now=SystemClock.elapsedRealtime();
        if(now-lastInputAt>300){clear();report("error","UDP_INPUT_STALE");return;}
        try{
            int seq=++sequence;
            byte[] header=new byte[PACKET];
            System.arraycopy(new byte[]{'Z','J','U','1'},0,header,0,4);
            System.arraycopy(token,0,header,4,8);put32(header,12,seq);
            System.arraycopy(prefix,0,header,16,4);put32(header,20,seq);
            System.arraycopy(new byte[]{'A','N','D','R'},0,header,24,4);
            byte[] values=new byte[14];
            for(int i=0;i<6;i++){values[2*i]=(byte)(channels[i]>>>8);values[2*i+1]=(byte)channels[i];}
            values[12]=(byte)(inputArm?1:0);
            byte[] encrypted=cipher(true,key,header,values);
            if(encrypted.length!=30)throw new IllegalStateException("UDP_CIPHER_LENGTH");
            System.arraycopy(encrypted,0,header,28,30);
            sendTimes[seq&127]=now;
            socket.send(new DatagramPacket(header,PACKET));
            sent++;
            for(int i=0;i<8;i++){
                byte[] incoming=new byte[PACKET];
                DatagramPacket packet=new DatagramPacket(incoming,PACKET);
                try{socket.receive(packet);}catch(java.net.SocketTimeoutException empty){break;}
                if(packet.getLength()!=PACKET||incoming[0]!='Z'||incoming[1]!='J'||
                   incoming[2]!='A'||incoming[3]!='1'||!Arrays.equals(Arrays.copyOfRange(incoming,4,12),token))continue;
                int ackSeq=get32(incoming,12);
                if(ackSeq<=lastAckSequence||ackSeq>sequence)continue;
                byte[] plain=cipher(false,key,incoming,Arrays.copyOfRange(incoming,28,PACKET));
                if(plain.length!=14||get32(plain,0)!=ackSeq||(plain[12]&5)!=5)continue;
                if(lastAckSequence>0&&ackSeq>lastAckSequence+1)estimatedLost+=ackSeq-lastAckSequence-1;
                long recorded=sendTimes[ackSeq&127];
                long newRtt=recorded>0?Math.max(0,SystemClock.elapsedRealtime()-recorded):0;
                if(ackCount>0)jitter=(jitter*7+Math.abs(newRtt-lastRtt))/8;
                lastRtt=newRtt;lastAckAt=SystemClock.elapsedRealtime();
                lastAckSequence=ackSeq;ackCount++;
                acknowledgedArm=(plain[12]&2)!=0;
                accepted=get32(plain,4);rejected=get32(plain,8);
                if(lastAckAt-lastUiAt>=80){lastUiAt=lastAckAt;report("ack",null);}
            }
            if(inputArm&&lastAckAt>0&&now-lastAckAt>350){
                clear();report("error","UDP_ACK_TIMEOUT");
            }else if(inputArm&&lastAckAt==0&&sent>17){
                clear();report("error","UDP_NO_ACK");
            }
        }catch(Exception error){clear();report("error","UDP_SEND_OR_AUTH_FAILED");}
    }
    void shutdown(){stop();sender.shutdownNow();}
}
