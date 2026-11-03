package org.trace.route;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.telephony.SignalStrength;
import android.telephony.TelephonyManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.Priority;

public final class TrackService extends Service {
  private static final long UPDATE_MS = 10000;
  private static final long FRESH_SPEED_MS = 25000;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler loop = new Handler(Looper.getMainLooper());
  private Session session;
  private Outbox outbox;
  private LocationManager locations;
  private FusedLocationProviderClient fused;
  private LocationCallback callback;
  private Location last;
  private int lastSpeedKmh;
  private LocationListener platformListener;
  private boolean stopping;
  private long lastPublished;
  private long lastQueuedFix;
  private long nextRetryAt;
  private long nextDeviceRegistrationAt;
  private final Runnable tick = new Runnable() { public void run() { heartbeat(); loop.postDelayed(this, UPDATE_MS); } };
  @Override public void onCreate() {
    super.onCreate(); session = new Session(this); outbox = new Outbox(this);
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    nm.createNotificationChannel(new NotificationChannel("tracking", "Duty tracking", NotificationManager.IMPORTANCE_LOW));
    nm.createNotificationChannel(new NotificationChannel("messages", "Route messages", NotificationManager.IMPORTANCE_HIGH));
    startForeground(1, trackingNotification("Duty active • location tracking"));
    locations = (LocationManager) getSystemService(LOCATION_SERVICE);
    if (!session.authenticated() || !session.get("duty").equals("1")) { stopSelf(); return; }
    fused = LocationServices.getFusedLocationProviderClient(this);
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
      LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_MS)
        .setMinUpdateIntervalMillis(UPDATE_MS).setMinUpdateDistanceMeters(0).build();
      callback = new LocationCallback() { @Override public void onLocationResult(LocationResult result) { for (Location l : result.getLocations()) onLocationChanged(l); } };
      // Android's GPS provider remains usable on phones without Google Play Services.
      platformListener = new LocationListener() {
        @Override public void onLocationChanged(Location l) { TrackService.this.onLocationChanged(l); }
        @Override public void onStatusChanged(String p, int status, android.os.Bundle extras) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { heartbeat(); }
      };
      try { locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, UPDATE_MS, 0, platformListener, Looper.getMainLooper()); }
      catch (Exception e) { session.set("syncError", "GPS provider unavailable"); }
      try {
        fused.requestLocationUpdates(request, callback, Looper.getMainLooper()).addOnFailureListener(e -> session.set("gpsProvider", "Android GPS"));
        fused.getLastLocation().addOnSuccessListener(l -> { if (l != null) onLocationChanged(l); });
      } catch (Exception ignored) { /* Android GPS remains active. */ }
    }
    loop.post(tick);
  }
  private Notification trackingNotification(String text) {
    PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this, "tracking").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("TRACK Route").setContentText(text).setContentIntent(open).setOngoing(true).build();
  }
  @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
  @Override public IBinder onBind(Intent intent) { return null; }
  public void onLocationChanged(Location location) {
    if (stopping || (last != null && location.getTime() <= last.getTime())) return;
    long now = System.currentTimeMillis();
    if (location.getTime() < now - 30000 || location.getTime() > now + 5000) return;
    if (!location.hasAccuracy() || location.getAccuracy() > 150) return;
    if (last != null && location.getAccuracy() > Math.max(50, last.getAccuracy() * 3) && now - last.getTime() < 60000) return;
    lastSpeedKmh = speedKmh(location, last);
    last = new Location(location);
    session.set("lastLat", String.valueOf(location.getLatitude())); session.set("lastLng", String.valueOf(location.getLongitude()));
    session.set("lastFix", String.valueOf(location.getTime())); session.set("lastSpeedKmh", String.valueOf(lastSpeedKmh));
    heartbeat();
  }
  private static int speedKmh(Location current, Location previous) {
    if (current.getAccuracy() <= 50 && current.hasSpeed() && (!current.hasSpeedAccuracy() || current.getSpeedAccuracyMetersPerSecond() <= 5)) {
      float metresPerSecond = current.getSpeed();
      return Float.isFinite(metresPerSecond) && metresPerSecond >= 0 && metresPerSecond <= 70
        ? Math.round(metresPerSecond * 3.6f) : 0;
    }
    if (previous == null || !previous.hasAccuracy() || previous.getAccuracy() > 50 || current.getAccuracy() > 50) return 0;
    float seconds = (current.getTime() - previous.getTime()) / 1000f;
    if (seconds < 3 || seconds > 30) return 0;
    float distance = previous.distanceTo(current);
    float noise = Math.max(10, previous.getAccuracy() + current.getAccuracy());
    float metresPerSecond = (distance - noise) / seconds;
    return metresPerSecond > 0 && metresPerSecond <= 70 ? Math.round(metresPerSecond * 3.6f) : 0;
  }
  private boolean gpsOn() { try { return locations.isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception e) { return false; } }
  private int battery() {
    Intent i = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    if (i == null) return -1; int level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
    return scale > 0 ? Math.round(level * 100f / scale) : -1;
  }
  private int signal() {
    try {
      if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return -1;
      if (android.os.Build.VERSION.SDK_INT < 28) return -1;
      SignalStrength s = ((TelephonyManager) getSystemService(TELEPHONY_SERVICE)).getSignalStrength();
      return s == null ? -1 : s.getLevel();
    } catch (Exception e) { return -1; }
  }
  private void heartbeat() {
    if (stopping || !session.configured() || !session.authenticated() || !session.get("duty").equals("1")) return;
    final long now = System.currentTimeMillis();
    final Location l = last == null ? null : new Location(last);
    boolean firstFix = l != null && lastQueuedFix == 0;
    if (!firstFix && now - lastPublished < UPDATE_MS) return;
    lastPublished = now;
    final boolean newFix = l != null && l.getTime() > lastQueuedFix;
    if (newFix) lastQueuedFix = l.getTime();
    final int speed = l != null && now - l.getTime() <= FRESH_SPEED_MS ? lastSpeedKmh : 0;
    final int fixSpeed = lastSpeedKmh;
    final int bat = battery(), sig = signal(); final boolean gps = gpsOn();
    session.set("battery", String.valueOf(bat)); session.set("signal", String.valueOf(sig)); session.set("gps", gps ? "on" : "off");
    if (!gps) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1, trackingNotification("GPS disabled • turn on location"));
    io.execute(() -> {
      try {
        if (stopping || !session.get("duty").equals("1")) return;
        JSONObject live = new JSONObject().put("up", now).put("gps", gps).put("bat", bat).put("sig", sig).put("v", BuildConfig.VERSION_NAME).put("duty", true).put("sessionId", session.get("sessionId"))
          .put("ps", session.get("ps")).put("route", session.get("route")).put("sd", session.get("sd")).put("officer", session.get("officer")).put("mobile", session.get("mobile")).put("el", session.get("el"));
        if (l != null) {
          live.put("lat", l.getLatitude()).put("lng", l.getLongitude()).put("t", l.getTime()).put("acc", l.getAccuracy()).put("spd", speed).put("hdg", l.getBearing());
          if (newFix) {
            String day = new java.text.SimpleDateFormat("yyyyMMdd", java.util.Locale.ROOT).format(new java.util.Date(l.getTime()));
            JSONArray point = new JSONArray().put(l.getLatitude()).put(l.getLongitude()).put(l.getAccuracy()).put(fixSpeed);
            outbox.add("track/" + session.uid() + "/" + day + "/mobile/" + l.getTime(), point);
          }
        }
        outbox.add("live/" + session.uid(), live);
        if (System.currentTimeMillis() < nextRetryAt) return;
        outbox.flush(session, 6);
        nextRetryAt = 0;
        session.set("syncError", ""); session.set("lastSync", String.valueOf(System.currentTimeMillis()));
        if (System.currentTimeMillis() >= nextDeviceRegistrationAt) {
          nextDeviceRegistrationAt = System.currentTimeMillis() + 5 * 60000;
          try {
            JSONObject device = new JSONObject().put("sd", session.get("sd")).put("ps", session.get("ps"))
              .put("route", session.get("route")).put("officer", session.get("officer")).put("mobile", session.get("mobile"))
              .put("force", "route").put("el", session.get("el")).put("v", BuildConfig.VERSION_NAME)
              .put("model", android.os.Build.MODEL);
            session.dbPut("devices/" + session.uid(), device);
            nextDeviceRegistrationAt = System.currentTimeMillis() + 60 * 60000;
          } catch (Exception ignored) { /* Live telemetry already reached the control room; retry registration later. */ }
        }
        pollMessage();
      } catch (Exception e) {
        nextRetryAt = System.currentTimeMillis() + 15000;
        session.set("syncError", "Location upload failed. Check connection and account assignment.");
      }
    });
  }
  private void pollMessage() {
    try {
      JSONObject m = session.dbGet("msg/" + session.uid()); String id = m.optString("id");
      if (id.isEmpty() || id.equals(session.get("lastMsgId"))) return;
      session.set("lastMsgId", id); session.set("lastMsg", m.optString("text")); session.set("lastVoice", m.optString("voice"));
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      Notification n = new Notification.Builder(this, "messages").setSmallIcon(android.R.drawable.ic_dialog_email).setContentTitle("TRACK Control Room").setContentText(m.optString("text", "New message")).setContentIntent(open).setAutoCancel(true).build();
      nm.notify(id.hashCode(), n);
    } catch (Exception ignored) { }
  }
  @Override public void onDestroy() {
    stopping = true;
    if (locations != null && platformListener != null) locations.removeUpdates(platformListener);
    loop.removeCallbacks(tick);
    if (fused != null && callback != null) fused.removeLocationUpdates(callback);
    if (session.authenticated() && !session.get("duty").equals("1")) io.execute(() -> {
      try {
        JSONObject ended = new JSONObject().put("up", 0).put("duty", false).put("gps", false);
        outbox.add("live/" + session.uid(), ended); outbox.flush(session);
      } catch (Exception e) { session.set("syncError", "Duty end queued for retry"); }
    });
    io.shutdown(); super.onDestroy();
  }
}
