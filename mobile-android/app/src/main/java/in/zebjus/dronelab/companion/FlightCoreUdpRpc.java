package in.zebjus.dronelab.companion;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** ZJM1 bounded request/reply transport. Crypto/scopes remain in KitAuth/firmware.
 * Retries reuse an identical random transaction ID and ciphertext. Firmware's
 * deduplication cache prevents repeated writes when an ACK is lost. */
final class FlightCoreUdpRpc {
    static final int PORT=4211, FRAGMENT=1024, REQUEST_MAX=9216, RESPONSE_MAX=16000;
    interface Binder { void bind(DatagramSocket socket) throws IOException; }
    static final class Result {
        final int status; final String proof,text;
        Result(int status,String proof,String text){this.status=status;this.proof=proof;this.text=text;}
    }
    private static void field(DataOutputStream out,String value,int max) throws IOException {
        byte[] bytes=(value==null?"":value).getBytes(StandardCharsets.UTF_8);
        if(bytes.length>max)throw new IOException("UDP field exceeds limit");
        for(byte b:bytes)if(b==0)throw new IOException("Invalid UDP field");
        out.writeShort(bytes.length);out.write(bytes);
    }
    static byte[] encode(String method,String route,String form,String[] headers) throws IOException {
        if(!method.equals("GET")&&!method.equals("POST")||headers.length!=4)throw new IOException("Invalid UDP operation");
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(bytes);
        out.writeByte(method.equals("GET")?1:2);field(out,route,64);field(out,form,8800);
        for(String header:headers)field(out,header,80);
        if(bytes.size()>REQUEST_MAX)throw new IOException("UDP request exceeds limit");return bytes.toByteArray();
    }
    static Result exchange(String ip,byte[] body,int timeoutMs,Binder binder,
                           Consumer<DatagramSocket> observer,BooleanSupplier cancelled) throws IOException {
        return exchangeAt(ip,PORT,body,timeoutMs,binder,observer,cancelled);
    }
    static Result exchangeAt(String ip,int port,byte[] body,int timeoutMs,Binder binder,
                             Consumer<DatagramSocket> observer,BooleanSupplier cancelled) throws IOException {
        byte[] id=new byte[8];new SecureRandom().nextBytes(id);
        final long deadline=System.nanoTime()+timeoutMs*1000000L;
        try(DatagramSocket socket=new DatagramSocket()){
            observer.accept(socket);binder.bind(socket);
            socket.connect(InetAddress.getByName(ip),port);socket.setSoTimeout(150);
            byte[] response=null;int received=0,total=0;long nextSend=0;
            while(System.nanoTime()<deadline){
                if(cancelled.getAsBoolean())throw new IOException("UDP request cancelled");
                long now=System.nanoTime();
                if(now>=nextSend){
                    int count=(body.length+FRAGMENT-1)/FRAGMENT;
                    for(int i=0;i<count;i++){
                        int n=Math.min(FRAGMENT,body.length-i*FRAGMENT);byte[] packet=new byte[16+n];
                        System.arraycopy(new byte[]{'Z','J','M','1'},0,packet,0,4);System.arraycopy(id,0,packet,4,8);
                        packet[12]=(byte)(body.length>>>8);packet[13]=(byte)body.length;packet[14]=(byte)i;packet[15]=(byte)count;
                        System.arraycopy(body,i*FRAGMENT,packet,16,n);socket.send(new DatagramPacket(packet,packet.length));
                    }
                    nextSend=now+600000000L;
                }
                byte[] packet=new byte[16+FRAGMENT+1];DatagramPacket incoming=new DatagramPacket(packet,packet.length);
                try{socket.receive(incoming);}catch(SocketTimeoutException retry){continue;}
                int length=incoming.getLength();
                if(length<17||packet[0]!='Z'||packet[1]!='J'||packet[2]!='R'||packet[3]!='1'||
                   !Arrays.equals(Arrays.copyOfRange(packet,4,12),id))continue;
                int size=((packet[12]&255)<<8)|(packet[13]&255),index=packet[14]&255,count=packet[15]&255;
                if(size<4||size>RESPONSE_MAX||count!=(size+FRAGMENT-1)/FRAGMENT||index>=count||
                   length!=16+Math.min(FRAGMENT,size-index*FRAGMENT))continue;
                if(response==null){response=new byte[size];total=size;}
                if(size!=total)continue;
                System.arraycopy(packet,16,response,index*FRAGMENT,length-16);received|=1<<index;
                if(received!=(1<<count)-1)continue;
                int status=((response[0]&255)<<8)|(response[1]&255),proofSize=((response[2]&255)<<8)|(response[3]&255);
                if(status<100||status>599||proofSize>64||4+proofSize>total)throw new IOException("Malformed UDP response");
                return new Result(status,new String(response,4,proofSize,StandardCharsets.UTF_8),
                    new String(response,4+proofSize,total-4-proofSize,StandardCharsets.UTF_8));
            }
            throw new SocketTimeoutException("UDP management reply missing; install FlightCore 1.5.0 or newer and allow UDP 4211");
        }
    }
}
