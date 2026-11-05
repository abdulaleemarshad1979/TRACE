package org.trace.monitor;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class ViewerLocationService extends Service {
  static final String ACTION_STOP = "org.trace.monitor.STOP_VIEWER_LOCATION";
  static final String PREFS = "viewer_tracking";
  private static final String CHANNEL = "viewer_location";
  private static final long INTERVAL_MS = 30000;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Runnable heartbeat = new Runnable() { @Override public void run() { publish(); main.postDelayed(this, INTERVAL_MS); } };
  private SharedPreferences prefs;
  private LocationManager locations;
  private LocationListener platformListener;
  private FusedLocationProviderClient fused;
  private LocationCallback fusedCallback;
  private Location latest;
  private long uploadedAt;
  private long roleCheckedAt;
  private String idToken;
  private long tokenExpiry;
  private boolean stopping;

  @Override public void onCreate() {
    super.onCreate();
    prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
    if (!prefs.getBoolean("enabled", false)) { stopSelf(); return; }
    if (!hasLocationPermission()) { prefs.edit().putBoolean("enabled", false).apply(); stopSelf(); return; }
    NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Viewer location sharing", NotificationManager.IMPORTANCE_LOW));
    try { startForeground(24, notification()); }
    catch (Exception e) { prefs.edit().putBoolean("enabled", false).apply(); stopSelf(); return; }
    locations = (LocationManager) getSystemService(LOCATION_SERVICE);
    fused = LocationServices.getFusedLocationProviderClient(this);
    startLocations();
    main.post(heartbeat);
  }

  private boolean hasLocationPermission() {
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }
  private Notification notification() {
    PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, ViewerLocationService.class).setAction(ACTION_STOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Trace Monitor · viewer location on")
      .setContentText("Sharing your location with the control room")
      .setContentIntent(open).addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop sharing", stop)
      .setOngoing(true).build();
  }
  private void startLocations() {
    if (!hasLocationPermission()) return;
    boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    LocationRequest request = new LocationRequest.Builder(fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY, INTERVAL_MS)
      .setMinUpdateIntervalMillis(INTERVAL_MS).build();
    fusedCallback = new LocationCallback() { @Override public void onLocationResult(LocationResult result) { for (Location location : result.getLocations()) onFix(location); } };
    try { fused.requestLocationUpdates(request, fusedCallback, Looper.getMainLooper()); } catch (Exception ignored) { }
    platformListener = new LocationListener() { @Override public void onLocationChanged(Location location) { onFix(location); } };
    try { locations.requestLocationUpdates(fine ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER, INTERVAL_MS, 0, platformListener, Looper.getMainLooper()); }
    catch (Exception ignored) { }
  }
  private void onFix(Location location) {
    if (stopping || !prefs.getBoolean("enabled", false) || !location.hasAccuracy() || location.getAccuracy() > 10000) return;
    long now = System.currentTimeMillis();
    if (location.getTime() < now - 60000 || location.getTime() > now + 5000) return;
    if (latest != null && location.getTime() <= latest.getTime()) return;
    latest = new Location(location);
    publish();
  }
  private void publish() {
    if (stopping || !prefs.getBoolean("enabled", false) || latest == null || latest.getTime() <= uploadedAt) return;
    Location fix = new Location(latest);
    if (System.currentTimeMillis() - fix.getTime() > 600000) return;
    io.execute(() -> {
      if (stopping || !prefs.getBoolean("enabled", false) || fix.getTime() <= uploadedAt) return;
      try {
        if (System.currentTimeMillis() - roleCheckedAt > 300000) checkViewerRole();
        JSONObject data = new JSONObject().put("lat", fix.getLatitude()).put("lng", fix.getLongitude())
          .put("acc", Math.round(fix.getAccuracy())).put("t", fix.getTime());
        database("PUT", "viewerLive/" + prefs.getString("uid", ""), data.toString());
        uploadedAt = fix.getTime();
      } catch (SecurityException denied) { main.post(this::stopSharing); }
      catch (Exception ignored) { idToken = null; }
    });
  }
  private void checkViewerRole() throws Exception {
    String uid = prefs.getString("uid", "");
    if (!"si_monitor".equals(database("GET", "roles/" + uid, null).replace("\"", ""))) throw new SecurityException("Viewer role revoked");
    String scope = database("GET", "siScopes/" + uid, null);
    if (scope.equals("null") || !new JSONObject(scope).has("mandal")) throw new SecurityException("Viewer scope revoked");
    roleCheckedAt = System.currentTimeMillis();
  }
  private String database(String method, String path, String body) throws Exception {
    String base = prefs.getString("database", "");
    URL url = new URL(base + "/" + path + ".json?auth=" + URLEncoder.encode(token(), "UTF-8"));
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    try {
      connection.setRequestMethod(method); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
      if (body != null) {
        connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
        try (OutputStream output = connection.getOutputStream()) { output.write(body.getBytes(StandardCharsets.UTF_8)); }
      }
      if (connection.getResponseCode() == 401 || connection.getResponseCode() == 403) throw new SecurityException("Viewer access denied");
      if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) throw new java.io.IOException("Database unavailable");
      try (InputStream input = connection.getInputStream()) { return readSmall(input); }
    } finally { connection.disconnect(); }
  }
  private String token() throws Exception {
    if (idToken != null && System.currentTimeMillis() < tokenExpiry - 120000) return idToken;
    String key = prefs.getString("key", ""), refresh = prefs.getString("refresh", "");
    HttpURLConnection connection = (HttpURLConnection) new URL("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(key, "UTF-8")).openConnection();
    try {
      connection.setRequestMethod("POST"); connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
      connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
      String form = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refresh, "UTF-8");
      try (OutputStream output = connection.getOutputStream()) { output.write(form.getBytes(StandardCharsets.UTF_8)); }
      if (connection.getResponseCode() == 400 || connection.getResponseCode() == 401 || connection.getResponseCode() == 403) throw new SecurityException("Sign-in expired");
      if (connection.getResponseCode() != 200) throw new java.io.IOException("Sign-in service unavailable");
      JSONObject result;
      try (InputStream input = connection.getInputStream()) { result = new JSONObject(readSmall(input)); }
      if (!prefs.getString("uid", "").equals(result.getString("user_id"))) throw new SecurityException("Account changed");
      idToken = result.getString("id_token");
      tokenExpiry = System.currentTimeMillis() + result.optLong("expires_in", 3600) * 1000;
      prefs.edit().putString("refresh", result.getString("refresh_token")).apply();
      return idToken;
    } finally { connection.disconnect(); }
  }
  private static String readSmall(InputStream input) throws Exception {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096]; int count;
    while ((count = input.read(buffer)) != -1) {
      if (output.size() + count > 65536) throw new java.io.IOException("Response too large");
      output.write(buffer, 0, count);
    }
    return output.toString("UTF-8");
  }
  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent != null && ACTION_STOP.equals(intent.getAction())) { stopSharing(); return START_NOT_STICKY; }
    return prefs.getBoolean("enabled", false) ? START_STICKY : START_NOT_STICKY;
  }
  private void stopSharing() {
    if (stopping) return;
    String uid = prefs.getString("uid", "");
    stopping = true;
    main.removeCallbacks(heartbeat);
    if (locations != null && platformListener != null) locations.removeUpdates(platformListener);
    if (fused != null && fusedCallback != null) fused.removeLocationUpdates(fusedCallback);
    prefs.edit().putBoolean("enabled", false).apply();
    if (!uid.isEmpty()) io.execute(() -> { try { database("DELETE", "viewerLive/" + uid, null); } catch (Exception ignored) { } prefs.edit().clear().apply(); });
    else prefs.edit().clear().apply();
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }
  @Override public void onDestroy() {
    main.removeCallbacks(heartbeat);
    if (locations != null && platformListener != null) locations.removeUpdates(platformListener);
    if (fused != null && fusedCallback != null) fused.removeLocationUpdates(fusedCallback);
    io.shutdown();
    super.onDestroy();
  }
  @Override public IBinder onBind(Intent intent) { return null; }
}
