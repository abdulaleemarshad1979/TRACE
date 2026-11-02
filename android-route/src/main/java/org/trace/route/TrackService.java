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
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler loop = new Handler(Looper.getMainLooper());
  private Session session;
  private Outbox outbox;
  private LocationManager locations;
  private FusedLocationProviderClient fused;
  private LocationCallback callback;
  private Location last;
  private long lastUploaded;
  private final Runnable tick = new Runnable() { public void run() { heartbeat(); loop.postDelayed(this, 30000); } };
  @Override public void onCreate() {
    super.onCreate(); session = new Session(this); outbox = new Outbox(this);
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    nm.createNotificationChannel(new NotificationChannel("tracking", "Duty tracking", NotificationManager.IMPORTANCE_LOW));
    nm.createNotificationChannel(new NotificationChannel("messages", "Route messages", NotificationManager.IMPORTANCE_HIGH));
    startForeground(1, trackingNotification("Duty active • location tracking"));
    locations = (LocationManager) getSystemService(LOCATION_SERVICE);
    fused = LocationServices.getFusedLocationProviderClient(this);
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
      long interval = 8000;
      try { interval = Math.max(5000, Math.min(10000, Long.parseLong(session.get("interval")))); } catch (Exception ignored) { }
      LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, interval).setMinUpdateIntervalMillis(5000).setMinUpdateDistanceMeters(3).build();
      callback = new LocationCallback() { @Override public void onLocationResult(LocationResult result) { for (Location l : result.getLocations()) onLocationChanged(l); } };
      fused.requestLocationUpdates(request, callback, Looper.getMainLooper());
      fused.getLastLocation().addOnSuccessListener(l -> { if (l != null) onLocationChanged(l); });
    }
    loop.post(tick);
  }
  private Notification trackingNotification(String text) {
    PendingIntent open = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    return new Notification.Builder(this, "tracking").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("TRACE Route").setContentText(text).setContentIntent(open).setOngoing(true).build();
  }
  @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
  @Override public IBinder onBind(Intent intent) { return null; }
  public void onLocationChanged(Location location) {
    if (location.getTime() < System.currentTimeMillis() - 120000 || location.getTime() > System.currentTimeMillis() + 30000) return;
    if (last != null && location.getAccuracy() > last.getAccuracy() * 3 && System.currentTimeMillis() - lastUploaded < 60000) return;
    last = location; lastUploaded = System.currentTimeMillis(); heartbeat();
    session.set("lastLat", String.valueOf(location.getLatitude())); session.set("lastLng", String.valueOf(location.getLongitude()));
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
      SignalStrength s = ((TelephonyManager) getSystemService(TELEPHONY_SERVICE)).getSignalStrength();
      return s == null ? -1 : s.getLevel();
    } catch (Exception e) { return -1; }
  }
  private void heartbeat() {
    if (!session.configured() || session.uid().isEmpty()) return;
    final long now = System.currentTimeMillis(); final Location l = last;
    final int bat = battery(), sig = signal(); final boolean gps = gpsOn();
    session.set("battery", String.valueOf(bat)); session.set("signal", String.valueOf(sig)); session.set("gps", gps ? "on" : "off");
    if (!gps) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(1, trackingNotification("GPS disabled • turn on location"));
    io.execute(() -> {
      try {
        JSONObject live = new JSONObject().put("up", now).put("gps", gps).put("bat", bat).put("sig", sig).put("v", "TRACE Route 1.0").put("duty", true).put("sessionId", session.get("sessionId"));
        if (l != null) {
          live.put("lat", l.getLatitude()).put("lng", l.getLongitude()).put("t", l.getTime()).put("acc", l.getAccuracy()).put("spd", Math.round(l.getSpeed() * 3.6f)).put("hdg", l.getBearing());
          if (now - lastUploaded < 5000) {
            String day = new java.text.SimpleDateFormat("yyyyMMdd", java.util.Locale.ROOT).format(new java.util.Date(l.getTime()));
            JSONArray point = new JSONArray().put(l.getLatitude()).put(l.getLongitude()).put(l.getAccuracy()).put(Math.round(l.getSpeed() * 3.6f));
            outbox.add("track/" + session.uid() + "/" + day + "/mobile/" + l.getTime(), point);
          }
        }
        outbox.add("live/" + session.uid(), live);
        outbox.flush(session);
        pollMessage();
      } catch (Exception ignored) { /* queued writes retry on the next heartbeat */ }
    });
  }
  private void pollMessage() {
    try {
      JSONObject m = session.dbGet("msg/" + session.uid()); String id = m.optString("id");
      if (id.isEmpty() || id.equals(session.get("lastMsgId"))) return;
      session.set("lastMsgId", id); session.set("lastMsg", m.optString("text")); session.set("lastVoice", m.optString("voice"));
      NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      PendingIntent open = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
      Notification n = new Notification.Builder(this, "messages").setSmallIcon(android.R.drawable.ic_dialog_email).setContentTitle("TRACE control room").setContentText(m.optString("text", "New message")).setContentIntent(open).setAutoCancel(true).build();
      nm.notify(id.hashCode(), n);
    } catch (Exception ignored) { }
  }
  @Override public void onDestroy() {
    loop.removeCallbacks(tick); if (fused != null && callback != null) fused.removeLocationUpdates(callback); io.shutdown(); super.onDestroy();
  }
}
