package com.rivian.nukeboy;


import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;


public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private LocationManager locationManager;
    private LocationListener locationListener;
    private ActivityResultLauncher<Intent> folderPickerLauncher;
    private int slotPistaActual = 0;
    private MediaPlayer alarmPlayer;
    private boolean linternaActiva = false;
    private final Handler backgroundClockHandler = new Handler(Looper.getMainLooper());
    private Runnable backgroundClockRunnable;

    @SuppressLint("BatteryLife")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Aplicar pantalla completa sin bordes ni barra de estado
        activarModoInmersivoTotal();

        // Eliminar el fondo blanco nativo del WebView que causaba la línea en el borde izquierdo/superior
        int colorFondo = Color.parseColor("#0a120b");
        getWindow().getDecorView().setBackgroundColor(colorFondo);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setBackgroundColor(colorFondo);
        }

        limpiarCacheAntigua();

        // 1. Mantener el CPU despierto con la pantalla bloqueada
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NukeBoy::CoreWakeLock");
            wakeLock.acquire();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (!powerManager.isIgnoringBatteryOptimizations(getPackageName())) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }
        }

        // 2. Mantener la antena Wi-Fi activa en modo de baja latencia
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            int lockMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                lockMode = WifiManager.WIFI_MODE_FULL_LOW_LATENCY;
            }
            wifiLock = wifiManager.createWifiLock(lockMode, "NukeBoy::RadioWifiLock");
            wifiLock.acquire();
        }

        // 3. Selector de carpetas nativo de Android
        folderPickerLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                        Uri treeUri = result.getData().getData();
                        if (treeUri != null) {
                            getContentResolver().takePersistableUriPermission(
                                    treeUri,
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                            );
                            escanearCarpetaSinCopiar(treeUri);
                        }
                    }
                }
        );

        // 4. Inyectar puente JavaScript
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new AndroidBridge(), "AndroidNukeboy");
        }

        // 5. Arrancar el puente GPS y el reloj nativo para alarmas/chime con pantalla bloqueada
        iniciarPuenteGPSContinuo();
        iniciarRelojNativoSegundoPlano();
    }

    private void activarModoInmersivoTotal() {
        try {
            Window window = getWindow();
            if (window == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }

            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            window.clearFlags(WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false);
                WindowInsetsController controller = window.getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }

            View decorView = window.getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            decorView.setSystemUiVisibility(uiOptions);
        } catch (Exception ignored) {}
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            activarModoInmersivoTotal();
        }
    }

    // Pulso nativo cada 5 segundos para garantizar que el Chime horario y las Alarmas suenen con pantalla bloqueada
    private void iniciarRelojNativoSegundoPlano() {
        if (backgroundClockRunnable != null) {
            backgroundClockHandler.removeCallbacks(backgroundClockRunnable);
        }
        backgroundClockRunnable = new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    String js = "if(window.pulsoRelojNativo) window.pulsoRelojNativo();";
                    bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
                }
                backgroundClockHandler.postDelayed(this, 5000);
            }
        };
        backgroundClockHandler.postDelayed(backgroundClockRunnable, 5000);
    }

    public static class GpsKeepAliveService extends Service {
        private static final String CHANNEL_ID = "NukeBoyTelemetryChannel";

        @Override
        public void onCreate() {
            super.onCreate();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Nuke-Boy GPS Telemetry",
                        NotificationManager.IMPORTANCE_LOW
                );
                channel.setSound(null, null);
                channel.enableVibration(false);
                NotificationManager manager = getSystemService(NotificationManager.class);
                if (manager != null) {
                    manager.createNotificationChannel(channel);
                }
            }
        }

        @Override
        public int onStartCommand(Intent intent, int flags, int startId) {
            Notification.Builder builder = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    ? new Notification.Builder(this, CHANNEL_ID)
                    : new Notification.Builder(this);

            Notification notification = builder
                    .setContentTitle("Nuke-Boy OS")
                    .setContentText("GPS, Alarms & Audio Telemetry Active")
                    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                    .setOngoing(true)
                    .build();

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(1001, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(1001, notification);
                }
            } catch (Exception ignored) {}

            return START_STICKY;
        }

        @Override
        public IBinder onBind(Intent intent) {
            return null;
        }
    }

    private void limpiarCacheAntigua() {
        new Thread(() -> {
            try {
                File oldDir = new File(getCacheDir(), "holotapes");
                if (oldDir.exists() && oldDir.isDirectory()) {
                    File[] files = oldDir.listFiles();
                    if (files != null) {
                        for (File f : files) f.delete();
                    }
                    oldDir.delete();
                }
            } catch (Exception ignored) {}
        }).start();
    }

    public void detenerAlarmaNativa() {
        try {
            if (alarmPlayer != null) {
                if (alarmPlayer.isPlaying()) alarmPlayer.stop();
                alarmPlayer.release();
                alarmPlayer = null;
            }
        } catch (Exception ignored) {}
    }

    public class AndroidBridge {

        @JavascriptInterface
        public boolean alternarLinternaNativa() {
            try {
                CameraManager cameraManager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
                if (cameraManager == null) return false;

                for (String id : cameraManager.getCameraIdList()) {
                    CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                    Boolean tieneFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                    Integer lensFacing = chars.get(CameraCharacteristics.LENS_FACING);

                    if (Boolean.TRUE.equals(tieneFlash) && (lensFacing == null || lensFacing == CameraCharacteristics.LENS_FACING_BACK)) {
                        linternaActiva = !linternaActiva;
                        cameraManager.setTorchMode(id, linternaActiva);
                        return linternaActiva;
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
            return false;
        }
        @JavascriptInterface
        public void seleccionarCarpetaAudio() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            folderPickerLauncher.launch(intent);
        }

        @JavascriptInterface
        public String prepararPistaIndividual(String uriString, String ext) {
            try {
                Uri uri = Uri.parse(uriString);
                slotPistaActual = (slotPistaActual + 1) % 2;
                String extensionLimpia = (ext != null && ext.startsWith(".")) ? ext : ".mp3";
                File targetFile = new File(getCacheDir(), "active_track_" + slotPistaActual + extensionLimpia);

                InputStream in = getContentResolver().openInputStream(uri);
                if (in == null) return "";

                FileOutputStream out = new FileOutputStream(targetFile);
                byte[] buffer = new byte[16384];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
                out.flush();
                out.close();
                in.close();

                return targetFile.getAbsolutePath();
            } catch (Exception e) {
                e.printStackTrace();
                return "";
            }
        }

        @JavascriptInterface
        public void dispararAlarmaNativa(String mensaje) {
            runOnUiThread(() -> {
                try {
                    detenerAlarmaNativa();

                    Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    if (vibrator != null && vibrator.hasVibrator()) {
                        long[] patron = {0, 500, 300, 500, 300, 700};
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            vibrator.vibrate(VibrationEffect.createWaveform(patron, -1));
                        } else {
                            vibrator.vibrate(patron, -1);
                        }
                    }

                    alarmPlayer = new MediaPlayer();
                    alarmPlayer.setAudioAttributes(
                            new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ALARM)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .build()
                    );

                    AssetFileDescriptor afd = getAssets().openFd("public/audio/levelup.wav");
                    alarmPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                    afd.close();

                    alarmPlayer.setLooping(true);
                    alarmPlayer.prepare();
                    alarmPlayer.start();

                    new Handler(Looper.getMainLooper()).postDelayed(() -> detenerAlarmaNativa(), 10000);

                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void detenerAlarmaNativa() {
            MainActivity.this.detenerAlarmaNativa();
        }

        @JavascriptInterface
        public void detenerAlarmaNativaJS() {
            MainActivity.this.detenerAlarmaNativa();
        }

        @JavascriptInterface
        public void reproducirChimeNativo() {
            runOnUiThread(() -> {
                try {
                    MediaPlayer chimePlayer = new MediaPlayer();
                    chimePlayer.setAudioAttributes(
                            new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ALARM)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .build()
                    );

                    AssetFileDescriptor afd = getAssets().openFd("public/audio/levelup.wav");
                    chimePlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                    afd.close();

                    chimePlayer.setLooping(false);
                    chimePlayer.setOnCompletionListener(MediaPlayer::release);
                    chimePlayer.prepare();
                    chimePlayer.start();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }
    }

    private void escanearCarpetaSinCopiar(Uri treeUri) {
        new Thread(() -> {
            try {
                JSONArray jsonArray = new JSONArray();
                String rootDocId = DocumentsContract.getTreeDocumentId(treeUri);
                ContentResolver resolver = getContentResolver();

                recursarMetadatosDirectorio(resolver, treeUri, rootDocId, jsonArray);

                final String jsonString = jsonArray.toString();
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().post(() -> {
                        String safeJson = JSONObject.quote(jsonString);
                        String js = "if(window.recibirCarpetaHolocintaNativa) window.recibirCarpetaHolocintaNativa(" + safeJson + ");";
                        bridge.getWebView().evaluateJavascript(js, null);
                    });
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }).start();
    }

    private void recursarMetadatosDirectorio(ContentResolver resolver, Uri treeUri, String parentDocId, JSONArray jsonArray) {
        Cursor cursor = null;
        try {
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
            cursor = resolver.query(childrenUri, new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE
            }, null, null, null);

            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String docId = cursor.getString(0);
                    String displayName = cursor.getString(1);
                    String mimeType = cursor.getString(2);

                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType)) {
                        recursarMetadatosDirectorio(resolver, treeUri, docId, jsonArray);
                    } else if (displayName != null && esArchivoAudioValido(displayName)) {
                        Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                        String ext = ".mp3";
                        int dotIndex = displayName.lastIndexOf('.');
                        if (dotIndex >= 0) {
                            ext = displayName.substring(dotIndex).toLowerCase();
                        }

                        String nombreSinExt = (dotIndex > 0) ? displayName.substring(0, dotIndex) : displayName;

                        JSONObject obj = new JSONObject();
                        obj.put("nombre", nombreSinExt.toUpperCase());
                        obj.put("uri", fileUri.toString());
                        obj.put("ext", ext);
                        jsonArray.put(obj);
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private boolean esArchivoAudioValido(String name) {
        String lower = name.toLowerCase();
        return lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".ogg") ||
                lower.endsWith(".m4a") || lower.endsWith(".flac") || lower.endsWith(".aac") ||
                lower.endsWith(".opus") || lower.endsWith(".wma") || lower.endsWith(".webm");
    }

    @SuppressLint("MissingPermission")
    private void iniciarPuenteGPSContinuo() {
        try {
            boolean tienePermiso = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

            if (!tienePermiso) return;

            try {
                Intent serviceIntent = new Intent(this, GpsKeepAliveService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            } catch (Exception ignored) {}

            if (locationManager == null) {
                locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            }
            if (locationManager == null) return;

            if (locationListener != null) {
                locationManager.removeUpdates(locationListener);
            }

            locationListener = new LocationListener() {
                @Override
                public void onLocationChanged(Location loc) {
                    if (loc == null || bridge == null || bridge.getWebView() == null) return;
                    final String js = String.format(Locale.US,
                            "if(window.recibirGPSNativoContinuo) window.recibirGPSNativoContinuo(%f, %f, %f);",
                            loc.getLatitude(), loc.getLongitude(), loc.getAccuracy());
                    bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
                }
                @Override public void onStatusChanged(String p, int s, Bundle e) {}
                @Override public void onProviderEnabled(String p) {}
                @Override public void onProviderDisabled(String p) {}
            };

            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 1f, locationListener, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000, 1f, locationListener, Looper.getMainLooper());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        activarModoInmersivoTotal();
        iniciarPuenteGPSContinuo();
    }

    @Override
    public void onPause() {
        super.onPause();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().onResume();
            this.bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().onResume();
            this.bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onDestroy() {
        detenerAlarmaNativa();
        if (backgroundClockRunnable != null) {
            backgroundClockHandler.removeCallbacks(backgroundClockRunnable);
        }
        try {
            stopService(new Intent(this, GpsKeepAliveService.class));
        } catch (Exception ignored) {}
        if (locationManager != null && locationListener != null) {
            locationManager.removeUpdates(locationListener);
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
        super.onDestroy();
    }
}