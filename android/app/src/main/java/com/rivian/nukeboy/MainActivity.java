package com.rivian.nukeboy;

import android.annotation.SuppressLint;
import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.Looper;
import android.os.PowerManager;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private LocationManager locationManager;
    private LocationListener locationListener;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Mantener el CPU despierto con la pantalla bloqueada
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PipBoy::CoreWakeLock");
            wakeLock.acquire();
        }

        // 2. Mantener la antena Wi-Fi activa para que el stream de radio no se corte
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "PipBoy::RadioWifiLock");
            wifiLock.acquire();
        }

        // 3. Arrancar el puente GPS nativo ininterrumpido
        iniciarPuenteGPSContinuo();
    }

    @SuppressLint("MissingPermission")
    private void iniciarPuenteGPSContinuo() {
        try {
            locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (locationManager == null) return;

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

            // Escuchar satélites GPS y triangulación cada 2 segundos o cada 2 metros
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 2f, locationListener, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 3000, 2f, locationListener, Looper.getMainLooper());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        iniciarPuenteGPSContinuo();
    }

    @Override
    public void onPause() {
        super.onPause();
        // Evitar que Android congele el JavaScript y los intervalos del Trail al apagar pantalla
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().resumeTimers();
        }
    }

    @Override
    public void onDestroy() {
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