package in.zebjus.dronelab.companion;
import java.util.Arrays;
import java.util.Base64;
import java.nio.charset.StandardCharsets;
/** Runs the exact Android datagram codec on a JVM against the C++ firmware host. */
public final class UdpRpcInterop {
    public static void main(String[] args) throws Exception {
        byte[] body=FlightCoreUdpRpc.encode(args[2],args[3],args[4],Arrays.copyOfRange(args,5,9));
        FlightCoreUdpRpc.Result result=FlightCoreUdpRpc.exchangeAt(args[0],Integer.parseInt(args[1]),body,5000,s->{},s->{},()->false);
        System.out.println(result.status);System.out.println(result.proof);
        System.out.println(Base64.getEncoder().encodeToString(result.text.getBytes(StandardCharsets.UTF_8)));
    }
}
