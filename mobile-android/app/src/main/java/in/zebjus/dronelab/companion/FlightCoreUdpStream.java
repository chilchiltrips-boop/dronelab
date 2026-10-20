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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** ZJUDP1: diagnostic input only. Physical motors stay firmware-disabled.
 *   58B encrypted input; negotiated legacy 58B or v2 72B encrypted feedback.
 *   Separate from management worker; new frames only, no joystick retransmission.
 *   Index 0..5 = T/R/P/Y/AUX1/AUX2; index 6 = input-arm flag (bit 0).
 */
final class FlightCoreUdpStream {
    static final int PORT=4210, PACKET=58;
    static final int FEEDBACK_PACKET=72;
    // Independent native receive/feedback watchdog. Firmware safety remains unchanged.
    static final long ACK_TIMEOUT_MS=750, FEEDBACK_NEUTRAL_MS=300, INPUT_STALE_MS=300;
    static final int NO_ACK_SENT_LIMIT=25;
    private final Activity activity;
    private final WebView view;
    private final FlightCoreWifiLink wifiLink;
    private final ScheduledExecutorService sender=Executors.newSingleThreadScheduledExecutor();
    // Like the proven Python DroneWiFiRX/DroneWiFiTX split: feedback cannot block 50 Hz sends.
    private final ExecutorService receiver=Executors.newSingleThreadExecutor();
    private final SecureRandom random=new SecureRandom();
    private ScheduledFuture<?> timer;
    private DatagramSocket socket;
    private byte[] key, token, prefix;
    private boolean active, inputArm, acknowledgedArm, feedbackNeutralized;
    private long lastInputAt, lastAckAt, lastUiAt, sent, ackCount, estimatedLost, lastRtt, jitter;
    private long lastSendAt, maxSendGapMs, maxAckGapMs;
    private int feedbackVersion=1,lastAppliedSeq,receiveAgeMs=-1,applyAgeMs=-1;
    private long feedbackCounter,lastFeedbackAt,lastAppliedProgressAt,firstRxAckAt,appliedAckCount;
    private String ackKind="LEGACY_RX_ACK",nackReason="NONE";
    private int sequence, lastAckSequence, accepted, rejected;
    private String streamId="";
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
            o.put("id",streamId);
            o.put("type",type);
            o.put("ok",!"error".equals(type));
            o.put("seq",lastAckSequence);
            o.put("sent",sent);o.put("ackReceived",ackCount);
            o.put("lost",estimatedLost);o.put("rejected",rejected);o.put("accepted",accepted);
            o.put("roundTripMs",lastRtt);o.put("jitterMs",jitter);
            o.put("lastPacketAgeMs",lastAckAt==0?-1:Math.max(0,SystemClock.elapsedRealtime()-lastAckAt));
            o.put("inputAgeMs",lastInputAt==0?-1:Math.max(0,SystemClock.elapsedRealtime()-lastInputAt));
            o.put("maxSendGapMs",maxSendGapMs);o.put("maxAckGapMs",maxAckGapMs);
            o.put("feedbackVersion",feedbackVersion);o.put("ackKind",ackKind);o.put("nackReason",nackReason);
            o.put("lastRxSeq",lastAckSequence);o.put("lastAppliedSeq",lastAppliedSeq);
            o.put("receiveAgeMs",receiveAgeMs<0?-1:receiveAgeMs+Math.max(0,SystemClock.elapsedRealtime()-lastFeedbackAt));
            o.put("applyAgeMs",applyAgeMs<0?-1:applyAgeMs+Math.max(0,SystemClock.elapsedRealtime()-lastFeedbackAt));
            o.put("appliedKnown",feedbackVersion==2&&lastAppliedSeq>0);o.put("appliedAckCount",appliedAckCount);
            o.put("feedbackNeutralized",feedbackNeutralized);
            o.put("inputArmed",!"error".equals(type)&&acknowledgedArm);o.put("motorsArmed",false);
            if(reason!=null)o.put("reason",reason);
            final long generation=startupGeneration;
            String script="window.zebjusNativeUdpEvent && window.zebjusNativeUdpEvent("+o.toString()+")";
            activity.runOnUiThread(()->{
                synchronized(FlightCoreUdpStream.this){
                    if(generation!=startupGeneration)return;
                    if(view.getParent()!=null)view.evaluateJavascript(script,null);
                }
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
        sequence=0;inputArm=acknowledgedArm=feedbackNeutralized=false;lastInputAt=0;lastAckAt=0;
    }

    // The origin-checked WebMessage callback runs on the Android WebView/UI
    // thread. Never open, bind or connect sockets there: strict-mode network
    // policy may reject that before the FIRST datagram is sent.
    private long startupGeneration=0;
    synchronized void stop(){startupGeneration++;clear();}
    synchronized void start(String id,String ip,String device,String claim,String keyHex){
        start(id,ip,device,claim,keyHex,1);
    }
    synchronized void start(String id,String ip,String device,String claim,String keyHex,int feedback){
        startupGeneration++;
        clear();
        streamId=id;
        sent=ackCount=estimatedLost=lastRtt=jitter=0;
        lastUiAt=0;lastAckSequence=accepted=rejected=0;
        lastSendAt=maxSendGapMs=maxAckGapMs=0;
        feedbackVersion=feedback;lastAppliedSeq=0;receiveAgeMs=applyAgeMs=-1;
        feedbackCounter=lastFeedbackAt=lastAppliedProgressAt=firstRxAckAt=appliedAckCount=0;
        ackKind=feedback==2?"RX_ACK":"LEGACY_RX_ACK";nackReason="NONE";
        feedbackNeutralized=false;
        Arrays.fill(sendTimes,0);
        channels[0]=channels[4]=channels[5]=1000;
        channels[1]=channels[2]=channels[3]=1500;
        if((feedback!=1&&feedback!=2)||id==null||!id.matches("[a-zA-Z0-9_-]{1,32}")||
           device==null||!device.matches("ZFC-A[12]-[A-F0-9]{12}")||
           claim==null||!claim.matches("[a-fA-F0-9]{32}")||
           keyHex==null||!keyHex.matches("[a-fA-F0-9]{64}")){
            report("error","UDP_SESSION_INVALID");return;
        }
        if(sender.isShutdown()){report("error","UDP_START_START_SENDER_NATIVE");return;}
        final long requestGeneration=startupGeneration;
        // Same single-thread executor subsequently runs the 50Hz sender.
        // Pending starts cannot resurrect a released or backgrounded session.
        sender.execute(()->{
            synchronized(FlightCoreUdpStream.this){
                if(requestGeneration!=startupGeneration)return;
                String stage="PINNED_NETWORK";
                byte[] secret=null,claimToken=null;
                DatagramSocket ds=null;
                try{
                    Network net=wifiLink.networkFor(ip,false);
                    if(!wifiLink.isPinnedTo(device))
                        throw new IllegalStateException("UDP_KIT_NOT_PINNED");
                    secret=hex(keyHex);claimToken=hex(claim.substring(0,16));
                    try{
                        stage="OPEN_SOCKET";
                        ds=new DatagramSocket();
                        stage="BIND_SOCKET";
                        net.bindSocket(ds);
                        stage="CONNECT_PEER";
                        ds.connect(InetAddress.getByName(ip),PORT);
                        ds.setSoTimeout(40);
                    }catch(Exception e){if(ds!=null)ds.close();throw e;}
                    stage="START_SENDER";
                    key=secret;token=claimToken;prefix=new byte[4];random.nextBytes(prefix);
                    socket=ds;active=true;
                    sent=ackCount=estimatedLost=lastRtt=jitter=0;
                    lastAckAt=lastUiAt=0;sequence=lastAckSequence=accepted=rejected=0;
                    lastSendAt=maxSendGapMs=maxAckGapMs=0;
                    lastInputAt=SystemClock.elapsedRealtime();
                    final DatagramSocket receiveSocket=ds;
                    receiver.execute(()->receiveLoop(requestGeneration,receiveSocket));
                    timer=sender.scheduleAtFixedRate(this::tick,0,20,TimeUnit.MILLISECONDS);
                    report("start",null);
                }catch(Exception error){
                    if(ds!=null)ds.close();
                    if(secret!=null)Arrays.fill(secret,(byte)0);
                    if(claimToken!=null)Arrays.fill(claimToken,(byte)0);
                    clear();
                    // No IP, SSID, claim, session key or exception message
                    // leaves native code. Stage and class identify the failing API.
                    final String category=error instanceof android.os.NetworkOnMainThreadException
                        ?"MAIN_THREAD_NETWORK":error instanceof java.net.SocketException
                        ?"SOCKET":error instanceof SecurityException
                        ?"PERMISSION":error instanceof IllegalStateException
                        ?"NETWORK_IDENTITY":error instanceof java.net.UnknownHostException
                        ?"ADDRESS":"NATIVE";
                    report("error","UDP_START_"+stage+"_"+category);
                }
            }
        });
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
        if(feedbackNeutralized&&armed)return; // explicit new claim required after degraded link
        if(armed&&!inputArm&&next[0]>1050)return;
        System.arraycopy(next,0,channels,0,6);
        inputArm=armed;lastInputAt=SystemClock.elapsedRealtime();
    }
    private synchronized void tick(){
        if(!active)return;
        final long now=SystemClock.elapsedRealtime();
        if(now-lastInputAt>INPUT_STALE_MS){
            // Snapshot the actual stalled input age before zeroing session state.
            report("error","UDP_INPUT_STALE");clear();return;
        }
        final long feedbackGap=lastAckAt>0?now-lastAckAt:sent*20;
        if(inputArm&&feedbackGap>FEEDBACK_NEUTRAL_MS){
            // Fail closed before the firmware 500 ms deadman: no stale
            // throttle or ARM during a delayed return ACK path.
            inputArm=false;acknowledgedArm=false;feedbackNeutralized=true;
            channels[0]=channels[4]=channels[5]=1000;
            channels[1]=channels[2]=channels[3]=1500;
            report("status","UDP_FEEDBACK_DEGRADED");
        }
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
            final long sendAt=SystemClock.elapsedRealtime();
            if(lastSendAt>0)maxSendGapMs=Math.max(maxSendGapMs,sendAt-lastSendAt);
            lastSendAt=sendAt;
            sent++;
            final long watchdogNow=SystemClock.elapsedRealtime();
            if((inputArm||feedbackNeutralized)&&lastAckAt>0&&watchdogNow-lastAckAt>ACK_TIMEOUT_MS){
                report("error","UDP_ACK_TIMEOUT");clear();
            }else if((inputArm||feedbackNeutralized)&&lastAckAt==0&&sent>NO_ACK_SENT_LIMIT*2){
                report("error","UDP_NO_ACK");clear();
            }else if(feedbackVersion==2&&(inputArm||feedbackNeutralized)&&firstRxAckAt>0&&
               watchdogNow-(lastAppliedProgressAt>0?lastAppliedProgressAt:firstRxAckAt)>ACK_TIMEOUT_MS){
                report("error","UDP_APPLY_TIMEOUT");clear();
            }
        }catch(Exception error){report("error","UDP_SEND_OR_AUTH_FAILED");clear();}
    }
    /** Only this worker blocks in receive(); socket closing or session change ends it. */
    private void receiveLoop(long generation,DatagramSocket readingSocket){
        while(!Thread.currentThread().isInterrupted()){
            synchronized(this){
                if(generation!=startupGeneration||!active||socket!=readingSocket)return;
            }
            // Fresh DatagramPacket each read: packet length must never truncate later feedback.
            byte[] bytes=new byte[FEEDBACK_PACKET+1];
            DatagramPacket packet=new DatagramPacket(bytes,bytes.length);
            try{
                readingSocket.receive(packet);
                synchronized(this){
                    if(generation!=startupGeneration||!active||socket!=readingSocket)return;
                    if(!receiveFeedback(bytes,packet.getLength()))return;
                }
            }catch(java.net.SocketTimeoutException expected){
                // Timeouts are normal and do NOT refresh authenticated ACK freshness.
            }catch(java.net.SocketException closed){
                synchronized(this){
                    if(generation==startupGeneration&&active&&socket==readingSocket){
                        report("error","UDP_RX_SOCKET_FAILED");clear();
                    }
                }
                return;
            }catch(Exception failure){
                synchronized(this){
                    if(generation==startupGeneration&&active&&socket==readingSocket){
                        report("error","UDP_RX_AUTH_OR_IO_FAILED");clear();
                    }
                }
                return;
            }
        }
    }
    private static int get16(byte[] b,int at){return ((b[at]&255)<<8)|(b[at+1]&255);}
    private void markReceived(int rx){
        if(rx<=lastAckSequence)return;
        if(lastAckSequence>0&&rx>lastAckSequence+1)estimatedLost+=rx-lastAckSequence-1;
        long recorded=sendTimes[rx&127];
        long rtt=recorded>0?Math.max(0,SystemClock.elapsedRealtime()-recorded):0;
        if(ackCount>0)jitter=(jitter*7+Math.abs(rtt-lastRtt))/8;
        lastRtt=rtt;final long at=SystemClock.elapsedRealtime();
        if(lastAckAt>0)maxAckGapMs=Math.max(maxAckGapMs,at-lastAckAt);
        if(firstRxAckAt==0)firstRxAckAt=at;
        lastAckAt=at;lastAckSequence=rx;ackCount++;
    }
    private boolean receiveFeedback(byte[] packet,int length)throws Exception{
        final boolean wasArmed=acknowledgedArm;
        final int expected=feedbackVersion==2?FEEDBACK_PACKET:PACKET;
        if(length!=expected||packet[0]!='Z'||packet[1]!='J'||packet[2]!='A'||
           packet[3]!=(feedbackVersion==2?'2':'1')||!Arrays.equals(Arrays.copyOfRange(packet,4,12),token))return true;
        int echo=get32(packet,12);if(echo<1||echo>sequence)return true;
        byte[] plain;
        try{plain=cipher(false,key,packet,Arrays.copyOfRange(packet,28,expected));}
        catch(javax.crypto.AEADBadTagException invalid){return true;}
        if(feedbackVersion==1){
            if(echo<=lastAckSequence||plain.length!=14||get32(plain,0)!=echo||(plain[12]&5)!=5||(plain[12]&~7)!=0)return true;
            markReceived(echo);acknowledgedArm=(plain[12]&2)!=0;
            accepted=get32(plain,4);rejected=get32(plain,8);ackKind="LEGACY_RX_ACK";
            receiveAgeMs=plain[13]&255;lastFeedbackAt=SystemClock.elapsedRealtime();
        }else{
            if(plain.length!=28||plain[27]!=0||packet[24]!='F'||packet[25]!='B'||packet[26]!='K'||packet[27]!='2')return true;
            final long counter=Integer.toUnsignedLong(get32(packet,20));
            final int rx=get32(plain,0),applied=get32(plain,4),flags=plain[24]&255,kind=plain[25]&255,reason=plain[26]&255;
            final int receiveAge=get16(plain,8),applyAge=get16(plain,10);
            final boolean terminal=(flags&16)!=0;
            if(counter==0||counter<=feedbackCounter||(flags&~31)!=0||(flags&4)==0||
               rx<lastAckSequence||rx<0||rx>sequence||applied<lastAppliedSeq||applied<0||applied>rx||
               ((flags&1)!=0)!=(rx>0)||((flags&8)!=0)!=(applied>0)||((flags&2)!=0&&applied==0)||
               (receiveAge==65535)!=(rx==0)||(applyAge==65535)!=(applied==0)||
               kind<1||kind>3||reason>5||(kind!=3&&(reason!=0||terminal||rx==0))||
               (kind==1&&echo!=rx)||(kind==2&&(applied==0||echo!=applied))||
               (kind==3&&(reason==0||(reason!=2&&!terminal))))return true;
            final int received=get32(plain,12),appliedCount=get32(plain,16),rejectCount=get32(plain,20);
            if(received<0||appliedCount<0||appliedCount>received||rejectCount<0)return true;
            feedbackCounter=counter;lastFeedbackAt=SystemClock.elapsedRealtime();
            receiveAgeMs=receiveAge==65535?-1:receiveAge;applyAgeMs=applyAge==65535?-1:applyAge;
            accepted=appliedCount;rejected=rejectCount;
            if(applied>lastAppliedSeq){lastAppliedSeq=applied;lastAppliedProgressAt=lastFeedbackAt;appliedAckCount++;}
            acknowledgedArm=(flags&2)!=0&&applied>0;
            ackKind=kind==1?"RX_ACK":kind==2?"APPLIED_ACK":"NACK";
            if(kind==3){
                final String[] reasons={"NONE","INVALID_FRAME","STALE","OWNER_CONFLICT","APPLY_STALLED","AUTH_EXPIRED"};
                nackReason=reasons[reason];report("nack",null);
                if(terminal){report("error","UDP_NACK_"+nackReason);clear();return false;}
                // NACKs never renew RX heartbeat or trigger retransmission.
                return true;
            }
            markReceived(rx);
        }
        final long at=SystemClock.elapsedRealtime();
        if(at-lastUiAt>=80||(!wasArmed&&acknowledgedArm)){lastUiAt=at;report("ack",null);}
        return true;
    }
    void shutdown(){stop();sender.shutdownNow();receiver.shutdownNow();}
}
