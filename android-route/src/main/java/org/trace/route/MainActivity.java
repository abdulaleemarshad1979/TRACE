package org.trace.route;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.util.Base64;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

public final class MainActivity extends Activity {
  private static final int PERMISSION = 10, PHOTO = 11, STOP = 12;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler ui = new Handler(Looper.getMainLooper());
  private Session session;
  private Outbox outbox;
  private TextView status, message, telemetry;
  private EditText key, db, email, password, sd, ps, route, officer, mobile, station, reportNote, votes, interval;
  private Button duty, voice;
  private MediaRecorder recorder;
  private File audioFile;
  private boolean recording;
  private final Runnable telemetryTick = new Runnable() { @Override public void run() {
    if (telemetry != null && session != null) telemetry.setText(session.get("battery").isEmpty()
      ? "Telemetry appears during active duty  ·  " + outbox.size() + " queued"
      : "Battery " + session.get("battery") + "%  ·  Signal " + session.get("signal") + "/4  ·  GPS " + session.get("gps") + "  ·  " + outbox.size() + " queued");
    ui.postDelayed(this, 5000);
  } };
  @Override public void onCreate(Bundle state) {
    super.onCreate(state); session = new Session(this); outbox = new Outbox(this);
    getWindow().setStatusBarColor(Color.rgb(8,8,8)); getWindow().setNavigationBarColor(Color.rgb(8,8,8)); getWindow().getDecorView().setSystemUiVisibility(0);
    ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
    LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(20), dp(26), dp(20), dp(32)); box.setBackgroundColor(Color.rgb(8,8,8)); scroll.addView(box);
    TextView title = new TextView(this); title.setText("TRACE  /  ROUTE"); title.setTextSize(25); title.setTextColor(Color.WHITE); title.setTypeface(null, 1); title.setLetterSpacing(0.06f); box.addView(title);
    addText(box, "Tracking Routes, Alerting & Coordinating Emergencies", 14);
    status = addText(box, "Sign in and start duty", 16);
    telemetry = addText(box, "Waiting for device status", 13);
    section(box, "CONNECTION & IDENTITY");
    key = field(box, "Firebase web API key", session.get("key"));
    db = field(box, "Realtime Database URL (https://…)", session.get("db"));
    email = field(box, "Route account email", session.get("email"));
    password = field(box, "Password (used only to sign in)", ""); password.setInputType(129);
    sd = field(box, "Sub-division", session.get("sd")); ps = field(box, "Police station", session.get("ps"));
    route = field(box, "Route name", session.get("route")); officer = field(box, "Officer name", session.get("officer")); mobile = field(box, "Officer mobile", session.get("mobile"));
    interval = field(box, "GPS interval in milliseconds (5000–10000)", session.get("interval").isEmpty() ? "8000" : session.get("interval"));
    button(box, "Scan route QR", () -> new IntentIntegrator(this).setPrompt("Scan route assignment").initiateScan());
    Button signIn = button(box, "Sign in / save assignment", () -> signIn());
    section(box, "ACTIVE DUTY");
    duty = button(box, "START DUTY", () -> toggleDuty());
    button(box, "SOS • REQUEST HELP", () -> sos());
    section(box, "FIELD REPORTS");
    station = field(box, "Polling station ID or name", ""); reportNote = field(box, "Report / incident details", ""); votes = field(box, "Votes polled (optional)", "");
    button(box, "Report: normal", () -> report("normal"));
    button(box, "Report: tension", () -> report("tension"));
    button(box, "Report: problem", () -> report("problem"));
    button(box, "Send turnout count", () -> report("votes"));
    button(box, "Reached incident spot", () -> report("reached"));
    button(box, "Take and send photo", () -> startActivityForResult(new Intent("android.media.action.IMAGE_CAPTURE"), PHOTO));
    voice = button(box, "Record voice message", () -> toggleRecording());
    message = addText(box, "Messages will appear here while duty is active.", 15);
    button(box, "Play latest voice reply", () -> playVoice());
    button(box, "Sign out", () -> { if (session.get("duty").equals("1")) { note("End Duty with authorization before signing out"); return; } session.clear(); status.setText("Signed out"); refreshDuty(); });
    setContentView(scroll); refreshDuty(); askPermissions(); ui.post(telemetryTick);
  }
  private int dp(int n) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n, getResources().getDisplayMetrics())); }
  private GradientDrawable shape(int fill, int border) { GradientDrawable d = new GradientDrawable(); d.setColor(fill); d.setCornerRadius(dp(10)); d.setStroke(dp(1), border); return d; }
  private void section(LinearLayout box, String label) { TextView t = addText(box, label, 11); t.setTextColor(Color.rgb(145,145,145)); t.setLetterSpacing(0.14f); t.setTypeface(null, 1); t.setPadding(0, dp(24), 0, dp(8)); }
  private TextView addText(LinearLayout box, String s, int size) { TextView v = new TextView(this); v.setText(s); v.setTextSize(size); v.setTextColor(Color.rgb(226,226,226)); v.setPadding(0, dp(6), 0, dp(6)); box.addView(v); return v; }
  private EditText field(LinearLayout box, String hint, String value) {
    EditText e = new EditText(this); e.setSingleLine(true); e.setHint(hint); e.setText(value); e.setTextSize(14);
    e.setTextColor(Color.WHITE); e.setHintTextColor(Color.rgb(140,140,140)); e.setPadding(dp(14), dp(12), dp(14), dp(12)); e.setBackground(shape(Color.rgb(20,20,20), Color.rgb(55,55,55)));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.bottomMargin = dp(9); box.addView(e, p); return e;
  }
  private Button button(LinearLayout box, String label, Runnable action) {
    Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextSize(14); b.setTypeface(null, 1);
    boolean primary = label.equals("START DUTY") || label.equals("Sign in / save assignment"); boolean sos = label.startsWith("SOS");
    b.setTextColor(primary ? Color.BLACK : Color.WHITE); b.setBackground(shape(primary ? Color.WHITE : (sos ? Color.rgb(185,28,28) : Color.rgb(30,30,30)), sos ? Color.rgb(185,28,28) : Color.rgb(62,62,62)));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(48)); p.bottomMargin = dp(9); box.addView(b, p); b.setOnClickListener(v -> action.run()); return b;
  }
  private String value(EditText e) { return e.getText().toString().trim(); }
  private void work(Runnable r) { io.execute(r); }
  private void note(String s) { ui.post(() -> status.setText(s)); }
  private void signIn() {
    if (session.get("duty").equals("1")) { note("End Duty before changing accounts or assignments"); return; }
    session.set("approved", "");
    final String pass = value(password);
    if (pass.isEmpty() && !session.configured()) { note("Enter password and Firebase settings"); return; }
    try { session.configure(value(key), value(db)); } catch (Exception e) { note(e.getMessage()); return; }
    session.set("interval", value(interval));
    final String emailValue = value(email), sdValue = value(sd), psValue = value(ps), routeValue = value(route), officerValue = value(officer), mobileValue = value(mobile);
    note("Signing in…");
    work(() -> {
      try {
        if (!pass.isEmpty()) session.signIn(emailValue, pass);
        else if (!"route".equals(session.dbGet("roles/" + session.uid()).optString("value"))) throw new SecurityException("Route role required");
        JSONObject assigned = session.dbGet("assignments/" + session.uid());
        if (assigned.optString("ps").isEmpty() || assigned.optString("route").isEmpty()) throw new SecurityException("No route assignment. Ask control room to assign this account.");
        if (!psValue.isEmpty() && !psValue.equals(assigned.optString("ps"))) throw new SecurityException("Scanned police station does not match approved assignment");
        if (!routeValue.isEmpty() && !routeValue.equals(assigned.optString("route"))) throw new SecurityException("Scanned route does not match approved assignment");
        session.set("sd", assigned.optString("sd")); session.set("ps", assigned.optString("ps")); session.set("route", assigned.optString("route")); session.set("officer", assigned.optString("officer")); session.set("mobile", assigned.optString("mobile"));
        JSONObject d = new JSONObject().put("sd", session.get("sd")).put("ps", session.get("ps")).put("route", session.get("route")).put("officer", session.get("officer")).put("mobile", session.get("mobile")).put("v", "TRACE Route 1.0");
        session.dbPut("devices/" + session.uid(), d);
        session.set("approved", "1");
        ui.post(() -> { sd.setText(session.get("sd")); ps.setText(session.get("ps")); route.setText(session.get("route")); officer.setText(session.get("officer")); mobile.setText(session.get("mobile")); password.setText(""); });
        note("Signed in • " + session.get("ps") + " / " + session.get("route"));
      } catch (Exception e) { note("Sign in failed: " + e.getMessage()); }
    });
  }
  private void askPermissions() {
    java.util.ArrayList<String> p = new java.util.ArrayList<>();
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.ACCESS_FINE_LOCATION);
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.RECORD_AUDIO);
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.POST_NOTIFICATIONS);
    if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) p.add(Manifest.permission.READ_PHONE_STATE);
    if (!p.isEmpty()) requestPermissions(p.toArray(new String[0]), PERMISSION);
  }
  private void refreshDuty() { duty.setText(session.get("duty").equals("1") ? "STOP DUTY" : "START DUTY"); }
  private void toggleDuty() {
    if (session.get("duty").equals("1")) {
      KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
      if (km != null && km.isDeviceSecure()) { startActivityForResult(km.createConfirmDeviceCredentialIntent("Stop TRACE duty", "Confirm the device credential to stop sharing location"), STOP); return; }
      EditText pin = new EditText(this); pin.setInputType(129); pin.setHint("Account password");
      new AlertDialog.Builder(this).setTitle("Confirm Stop Duty").setView(pin).setNegativeButton("Cancel", null).setPositiveButton("Stop duty", (dialog, which) -> work(() -> {
        try { session.signIn(session.get("email"), pin.getText().toString()); ui.post(this::stopDuty); } catch (Exception e) { note("Stop not authorised: " + e.getMessage()); }
      })).show(); return;
    }
    if (!session.configured() || !session.get("approved").equals("1")) { note("Sign in and confirm an approved route first"); return; }
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { askPermissions(); note("Allow precise location, then start duty"); return; }
    android.location.LocationManager lm = (android.location.LocationManager) getSystemService(LOCATION_SERVICE);
    if (lm == null || !lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)) { note("Turn on GPS before starting duty"); startActivity(new Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS)); return; }
    session.set("sessionId", UUID.randomUUID().toString()); session.set("duty", "1"); startForegroundService(new Intent(this, TrackService.class)); queueEvent("start"); note("Duty active • location tracking started"); refreshDuty();
  }
  private void stopDuty() {
    stopService(new Intent(this, TrackService.class)); session.set("duty", "0"); queueEvent("stop");
    try { JSONObject ended = new JSONObject().put("up", 0).put("duty", false).put("gps", false); outbox.add("live/" + session.uid(), ended); work(() -> { try { outbox.flush(session); } catch (Exception ignored) { } }); } catch (Exception ignored) { }
    session.set("sessionId", ""); note("Duty stopped"); refreshDuty();
  }
  private String id() { return Long.toString(System.currentTimeMillis(),36) + UUID.randomUUID().toString().substring(0,8); }
  private void queueEvent(String type) {
    if (session.uid().isEmpty()) return;
    try { JSONObject e = new JSONObject().put("type", type).put("uid", session.uid()).put("t", System.currentTimeMillis()).put("ps", session.get("ps")).put("route", session.get("route")).put("sessionId", session.get("sessionId"));
      if (!session.get("lastLat").isEmpty()) { e.put("lat", Double.parseDouble(session.get("lastLat"))); e.put("lng", Double.parseDouble(session.get("lastLng"))); }
      String path = "events/" + id(); outbox.add(path, e); work(() -> {
        if (type.equals("sos")) {
          try { session.dbPut(path, e); outbox.removePath(path); note("SOS delivered"); }
          catch (Exception x) { note("SOS queued offline • " + outbox.size() + " pending"); return; }
        }
        try { outbox.flush(session); if (!type.equals("sos")) note(type.toUpperCase() + " delivered"); }
        catch (Exception x) { if (!type.equals("sos")) note(type.toUpperCase() + " queued offline • " + outbox.size() + " pending"); }
      });
    } catch (Exception e) { note(e.getMessage()); }
  }
  private void sos() { if (!session.configured()) { note("Sign in first"); return; } queueEvent("sos"); }
  private void report(String type) {
    if (session.uid().isEmpty()) { note("Sign in first"); return; }
    try {
      String name = value(station), detail = value(reportNote); if (name.isEmpty() && !type.equals("reached")) { note("Enter a polling station"); return; }
      long t = System.currentTimeMillis(); JSONObject e = new JSONObject().put("type", type.equals("votes") || type.equals("reached") ? type : "loc").put("uid", session.uid()).put("t", t).put("sid", name).put("sname", name).put("note", detail);
      if (!type.equals("votes") && !type.equals("reached")) e.put("status", type);
      if (type.equals("votes")) e.put("n", Integer.parseInt(value(votes)));
      if (!session.get("lastLat").isEmpty()) e.put("lat", Double.parseDouble(session.get("lastLat"))).put("lng", Double.parseDouble(session.get("lastLng")));
      outbox.add("events/" + id(), e); note("Report queued"); work(() -> { try { outbox.flush(session); note("Report delivered"); } catch (Exception ex) { note("Report queued offline"); } });
    } catch (Exception e) { note("Report failed: " + e.getMessage()); }
  }
  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    IntentResult scan = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
    if (scan != null && scan.getContents() != null) {
      try { JSONObject q = new JSONObject(scan.getContents()); key.setText(q.optString("k")); db.setText(q.optString("d")); sd.setText(q.optString("sd")); ps.setText(q.optString("ps")); route.setText(q.optString("r")); note("Route QR loaded • sign in to claim assignment"); } catch (Exception e) { note("Invalid route QR"); }
      return;
    }
    if (requestCode == STOP) { if (resultCode == RESULT_OK) stopDuty(); else note("Stop Duty cancelled"); return; }
    if (requestCode != PHOTO || resultCode != RESULT_OK || data == null || !(data.getExtras().get("data") instanceof Bitmap)) return;
    try {
      Bitmap b = (Bitmap) data.getExtras().get("data"); ByteArrayOutputStream stream = new ByteArrayOutputStream(); b.compress(Bitmap.CompressFormat.JPEG, 75, stream);
      String pid = id(); long t = System.currentTimeMillis();
      JSONObject photo = new JSONObject().put("uid", session.uid()).put("t", t).put("img", Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP));
      JSONObject event = new JSONObject().put("type", "photo").put("uid", session.uid()).put("t", t).put("pid", pid);
      outbox.add("photos/" + pid, photo); outbox.add("events/" + id(), event);
      note("Photo queued • " + outbox.size() + " pending"); work(() -> { try { outbox.flush(session); note("Photo delivered"); } catch (Exception e) { note("Photo queued offline"); } });
    } catch (Exception e) { note("Photo failed: " + e.getMessage()); }
  }
  private void toggleRecording() {
    if (recording) {
      try { recorder.stop(); recorder.release(); recording = false; voice.setText("Record voice message");
        byte[] bytes = Files.readAllBytes(audioFile.toPath()); if (bytes.length > 900000) { note("Recording too large; keep it under about 1 minute"); return; }
        long t = System.currentTimeMillis(); String vid = id();
        JSONObject v = new JSONObject().put("uid", session.uid()).put("a", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("mime", "audio/mp4").put("t", t).put("by", session.get("email"));
        JSONObject e = new JSONObject().put("type", "msg").put("uid", session.uid()).put("t", t).put("voice", vid).put("text", "Voice message from route unit");
        outbox.add("voice/" + vid, v); outbox.add("events/" + id(), e); note("Voice queued");
        work(() -> { try { outbox.flush(session); note("Voice delivered"); } catch (Exception ex) { note("Voice queued offline"); } });
      } catch (Exception e) { recording = false; note("Recording failed: " + e.getMessage()); } return;
    }
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { askPermissions(); note("Allow microphone access"); return; }
    try {
      audioFile = new File(getCacheDir(), "voice.m4a"); recorder = new MediaRecorder();
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC); recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4); recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); recorder.setOutputFile(audioFile.getAbsolutePath());
      recorder.prepare(); recorder.start(); recording = true; voice.setText("Stop and send recording"); note("Recording…");
    } catch (Exception e) { note("Microphone failed: " + e.getMessage()); }
  }
  private void playVoice() {
    String vid = session.get("lastVoice"); if (vid.isEmpty()) { note("No voice reply yet"); return; }
    work(() -> { try {
      JSONObject v = session.dbGet("voice/" + vid); byte[] bytes = Base64.decode(v.getString("a"), Base64.DEFAULT);
      File f = new File(getCacheDir(), "reply.m4a"); Files.write(f.toPath(), bytes);
      ui.post(() -> { try { android.media.MediaPlayer p = new android.media.MediaPlayer(); p.setDataSource(f.getAbsolutePath()); p.prepare(); p.start(); p.setOnCompletionListener(android.media.MediaPlayer::release); } catch (Exception e) { note("Playback failed: " + e.getMessage()); } });
    } catch (Exception e) { note("Voice download failed: " + e.getMessage()); } });
  }
  @Override protected void onResume() { super.onResume(); if (message != null) message.setText(session.get("lastMsg").isEmpty() ? "Messages will appear here while duty is active." : session.get("lastMsg")); }
  @Override protected void onDestroy() { ui.removeCallbacks(telemetryTick); io.shutdown(); super.onDestroy(); }
}
