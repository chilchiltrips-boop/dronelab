package in.zebjus.dronelab.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Optional diagnostic-only credential, encrypted at rest with non-exportable Android Keystore key.
 * Never stores OWNER/OTA credentials. Android backup of these preferences is disabled. */
final class FlightCoreKitVault {
    private static final String ALIAS="zebjus.flightcore.enrollment.v1";
    private static final String PREF="flightcore.optional.enrollment";
    private final Context context;
    FlightCoreKitVault(Context context){this.context=context.getApplicationContext();}
    private static boolean validId(String id){return id!=null&&id.matches("ZFC-A[12]-[0-9A-F]{12}");}
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        KeyStore.Entry entry=store.getEntry(ALIAS,null);
        if(entry instanceof KeyStore.SecretKeyEntry)return ((KeyStore.SecretKeyEntry)entry).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    synchronized void store(String id,String credential) throws Exception {
        if(!validId(id)||credential==null||!credential.matches("[a-fA-F0-9]{32}"))
            throw new IllegalArgumentException("Only per-Kit 32-hex diagnostic credentials may be saved");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,key());
        cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext=cipher.doFinal(credential.toLowerCase(java.util.Locale.ROOT).getBytes(StandardCharsets.US_ASCII));
        byte[] iv=cipher.getIV();
        String packed=Base64.encodeToString(iv,Base64.NO_WRAP)+"."+Base64.encodeToString(ciphertext,Base64.NO_WRAP);
        context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(id,packed).apply();
    }
    synchronized String load(String id) throws Exception {
        if(!validId(id))throw new IllegalArgumentException("Invalid Device ID");
        String packed=context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(id,null);
        if(packed==null)return "";
        String[] halves=packed.split("\\.",-1);
        if(halves.length!=2)throw new IllegalStateException("Saved enrollment corrupt");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(halves[0],Base64.NO_WRAP)));
        cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8));
        String credential=new String(cipher.doFinal(Base64.decode(halves[1],Base64.NO_WRAP)),StandardCharsets.US_ASCII);
        if(!credential.matches("[a-f0-9]{32}"))throw new IllegalStateException("Saved enrollment invalid");
        return credential;
    }
    synchronized void forget(String id){
        if(validId(id))context.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(id).apply();
    }
}
