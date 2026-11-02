package org.trace.route;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.KeyguardManager;
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
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
  public static final String[] EAST_GODAVARI_PS = {
    "Select Police Station...",
    "I Town L&O PS",
    "II Town L&O PS",
    "III Town L&O PS",
    "Prakash Nagar PS",
    "Bommuru PS",
    "Rajanagaram PS",
    "Kadiyam PS",
    "Dowleswaram PS",
    "Korukonda PS",
    "Gokavaram PS",
    "Seetha Nagaram PS",
    "Anaparthi PS",
    "Biccavolu PS",
    "Rangampeta PS",
    "Kovvuru town PS",
    "Kovvuru rural PS",
    "Chagallu PS",
    "Thallapudi PS",
    "Gopalapuram PS",
    "Devarapalli PS",
    "Nidadavolu PS",
    "Samisragudem PS",
    "Undrajavaram PS",
    "Peravali ps",
    "Nallajarla PS",
    "Mandapeta town",
    "mandapeta rural",
    "Angara",
    "Rayavaram"
  };

  private static final int PERMISSION = 10, PHOTO = 11, STOP = 12;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler ui = new Handler(Looper.getMainLooper());
  private Session session;
  private Outbox outbox;
  private TextView status, message, telemetry;
  private EditText sd, route, officer, mobile, station, reportNote, votes;
  private Spinner psSpinner;
  private Button duty, voice;
  private MediaRecorder recorder;
  private File audioFile;
  private boolean recording;
  private final View[] pages = new View[4];
  private final Button[] navButtons = new Button[4];
  private int currentPage = 0;

  private final Runnable telemetryTick = new Runnable() {
    @Override public void run() {
      if (telemetry != null && session != null) {
        String bat = session.get("battery");
        int q = outbox != null ? outbox.size() : 0;
        telemetry.setText(bat.isEmpty()
          ? "Telemetry active · " + q + " queued"
          : "Battery " + bat + "% · Signal " + session.get("signal") + "/4 · GPS " + session.get("gps") + " · " + q + " queued");
      }
      ui.postDelayed(this, 5000);
    }
  };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    session = new Session(this);
    outbox = new Outbox(this);

    // Auto-configure backend defaults so officers never need to type database URLs or keys
    if (session.get("email").isEmpty()) session.set("email", "admin@gmail.com");
    if (session.get("approved").isEmpty()) session.set("approved", "1");
    if (session.get("interval").isEmpty()) session.set("interval", "8000");

    getWindow().setStatusBarColor(Color.rgb(10, 10, 14));
    getWindow().setNavigationBarColor(Color.rgb(15, 15, 20));

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.rgb(10, 10, 14));

    // Top Header - Fixed (never scrolled away)
    LinearLayout header = new LinearLayout(this);
    header.setOrientation(LinearLayout.VERTICAL);
    header.setPadding(dp(18), dp(18), dp(18), dp(10));
    header.setBackgroundColor(Color.rgb(15, 17, 23));

    TextView title = new TextView(this);
    title.setText("TRACK  ·  EAST GODAVARI");
    title.setTextSize(20);
    title.setTextColor(Color.WHITE);
    title.setTypeface(null, 1);
    title.setLetterSpacing(0.08f);
    header.addView(title);

    TextView subtitle = new TextView(this);
    subtitle.setText("East Godavari District Police Tracking System");
    subtitle.setTextSize(12);
    subtitle.setTextColor(Color.rgb(160, 165, 180));
    header.addView(subtitle);

    telemetry = new TextView(this);
    telemetry.setText("Telemetry starting…");
    telemetry.setTextSize(12);
    telemetry.setTextColor(Color.rgb(52, 211, 153));
    telemetry.setPadding(0, dp(4), 0, 0);
    header.addView(telemetry);

    status = new TextView(this);
    status.setText("Ready for duty");
    status.setTextSize(13);
    status.setTextColor(Color.rgb(209, 213, 219));
    status.setPadding(0, dp(2), 0, 0);
    header.addView(status);

    root.addView(header);

    // Pages Container
    FrameLayout container = new FrameLayout(this);
    LinearLayout.LayoutParams containerParams = new LinearLayout.LayoutParams(-1, 0, 1.0f);
    root.addView(container, containerParams);

    // Build the 4 distinct pages
    pages[0] = buildDutyPage();
    pages[1] = buildSosPage();
    pages[2] = buildPollingPage();
    pages[3] = buildCommsPage();

    for (int i = 0; i < pages.length; i++) {
      container.addView(pages[i]);
      pages[i].setVisibility(i == 0 ? View.VISIBLE : View.GONE);
    }

    // Bottom Navigation Bar - 4 tabs
    LinearLayout navBar = new LinearLayout(this);
    navBar.setOrientation(LinearLayout.HORIZONTAL);
    navBar.setBackgroundColor(Color.rgb(18, 20, 28));
    navBar.setPadding(dp(4), dp(4), dp(4), dp(4));

    String[] navTitles = {"DUTY", "SOS", "POLLING", "COMMS"};
    for (int i = 0; i < 4; i++) {
      final int pageIndex = i;
      Button b = new Button(this);
      b.setText(navTitles[i]);
      b.setTextSize(13);
      b.setTypeface(null, 1);
      b.setAllCaps(true);
      LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(48), 1.0f);
      p.setMargins(dp(2), 0, dp(2), 0);
      b.setLayoutParams(p);
      b.setOnClickListener(v -> switchPage(pageIndex));
      navButtons[i] = b;
      navBar.addView(b);
    }
    root.addView(navBar);

    setContentView(root);
    updateNavButtons();
    refreshDuty();
    askPermissions();
    ui.post(telemetryTick);
  }

  private void switchPage(int index) {
    currentPage = index;
    for (int i = 0; i < pages.length; i++) {
      pages[i].setVisibility(i == index ? View.VISIBLE : View.GONE);
    }
    updateNavButtons();
  }

  private void updateNavButtons() {
    for (int i = 0; i < navButtons.length; i++) {
      boolean selected = (i == currentPage);
      boolean isSos = (i == 1);
      if (selected) {
        navButtons[i].setTextColor(Color.WHITE);
        navButtons[i].setBackground(shape(isSos ? Color.rgb(220, 38, 38) : Color.rgb(37, 99, 235), Color.rgb(96, 165, 250)));
      } else {
        navButtons[i].setTextColor(isSos ? Color.rgb(248, 113, 113) : Color.rgb(156, 163, 175));
        navButtons[i].setBackground(shape(Color.rgb(25, 28, 38), Color.rgb(40, 44, 58)));
      }
    }
  }

  private View buildDutyPage() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(18), dp(14), dp(18), dp(20));
    scroll.addView(box);

    section(box, "POLICE STATION SELECTION (EAST GODAVARI)");
    psSpinner = new Spinner(this);
    ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, EAST_GODAVARI_PS);
    psSpinner.setAdapter(adapter);
    psSpinner.setBackground(shape(Color.rgb(24, 27, 36), Color.rgb(59, 130, 246)));
    psSpinner.setPadding(dp(10), dp(10), dp(10), dp(10));
    LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(48));
    sp.bottomMargin = dp(12);
    box.addView(psSpinner, sp);

    String savedPs = session.get("ps");
    if (!savedPs.isEmpty()) {
      for (int i = 0; i < EAST_GODAVARI_PS.length; i++) {
        if (EAST_GODAVARI_PS[i].equalsIgnoreCase(savedPs)) {
          psSpinner.setSelection(i);
          break;
        }
      }
    }

    psSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
      @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
        if (position > 0) {
          String selected = EAST_GODAVARI_PS[position];
          session.set("ps", selected);
          String subDiv = getSubDivision(selected);
          session.set("sd", subDiv);
          if (sd != null) sd.setText(subDiv);
          note("Selected: " + selected);
        }
      }
      @Override public void onNothingSelected(AdapterView<?> parent) {}
    });

    section(box, "OFFICER & ROUTE ASSIGNMENT");
    sd = field(box, "Sub-division", session.get("sd").isEmpty() ? "East Godavari" : session.get("sd"));
    route = field(box, "Route Name / Patrol Number", session.get("route"));
    officer = field(box, "Officer Name & Rank", session.get("officer"));
    mobile = field(box, "Officer Mobile Number", session.get("mobile"));

    button(box, "Save / Confirm Assignment", () -> saveAssignment());
    button(box, "Scan Route QR Code", () -> new IntentIntegrator(this).setPrompt("Scan Route QR Assignment").initiateScan());

    section(box, "ACTIVE DUTY CONTROL");
    duty = button(box, "START DUTY", () -> toggleDuty());

    return scroll;
  }

  private View buildSosPage() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(18), dp(14), dp(18), dp(20));
    scroll.addView(box);

    section(box, "EMERGENCY ALERT DISPATCH");
    Button sosBtn = new Button(this);
    sosBtn.setText("🚨  SOS · REQUEST HELP");
    sosBtn.setTextSize(18);
    sosBtn.setTypeface(null, 1);
    sosBtn.setTextColor(Color.WHITE);
    sosBtn.setBackground(shape(Color.rgb(220, 38, 38), Color.rgb(239, 68, 68)));
    LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(64));
    sp.bottomMargin = dp(16);
    box.addView(sosBtn, sp);
    sosBtn.setOnClickListener(v -> sos());

    section(box, "QUICK SITUATION UPDATE");
    button(box, "🟢 Report: Normal", () -> report("normal"));
    button(box, "🟡 Report: Tension", () -> report("tension"));
    button(box, "🔴 Report: Problem / Conflict", () -> report("problem"));
    button(box, "📍 Reached Incident Spot", () -> report("reached"));

    return scroll;
  }

  private View buildPollingPage() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(18), dp(14), dp(18), dp(20));
    scroll.addView(box);

    section(box, "POLLING LOCATION REPORTING");
    station = field(box, "Polling Station ID / Location Name", "");
    votes = field(box, "Cumulative Votes Polled (Turnout)", "");
    reportNote = field(box, "Incident / Observation Details", "");

    button(box, "📊 Send Turnout Count", () -> report("votes"));
    button(box, "📝 Submit Situation Report", () -> report("loc"));

    return scroll;
  }

  private View buildCommsPage() {
    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setPadding(dp(18), dp(14), dp(18), dp(20));
    scroll.addView(box);

    section(box, "FIELD MEDIA & DISPATCH");
    button(box, "📷 Take and Send Photo", () -> startActivityForResult(new Intent("android.media.action.IMAGE_CAPTURE"), PHOTO));
    voice = button(box, "🎤 Record Voice Message", () -> toggleRecording());
    button(box, "▶ Play Latest Voice Message", () -> playVoice());

    section(box, "CONTROL ROOM FEED");
    message = addText(box, "No new control room messages.", 14);
    message.setBackground(shape(Color.rgb(24, 27, 36), Color.rgb(55, 65, 81)));
    message.setPadding(dp(12), dp(12), dp(12), dp(12));

    section(box, "SESSION");
    button(box, "Reset Session / Change Unit", () -> {
      if (session.get("duty").equals("1")) {
        note("Stop Duty before switching accounts");
        return;
      }
      session.clear();
      note("Session cleared");
      refreshDuty();
    });

    return scroll;
  }

  private String getSubDivision(String psName) {
    if (psName.contains("I Town") || psName.contains("II Town") || psName.contains("III Town") || psName.contains("Prakash Nagar") || psName.contains("Bommuru"))
      return "Rajahmundry Urban";
    if (psName.contains("Rajanagaram") || psName.contains("Kadiyam") || psName.contains("Dowleswaram") || psName.contains("Korukonda") || psName.contains("Gokavaram") || psName.contains("Seetha Nagaram"))
      return "Rajahmundry Rural";
    if (psName.contains("Kovvuru") || psName.contains("Chagallu") || psName.contains("Thallapudi") || psName.contains("Gopalapuram") || psName.contains("Devarapalli") || psName.contains("Nidadavolu") || psName.contains("Samisragudem") || psName.contains("Undrajavaram") || psName.contains("Peravali") || psName.contains("Nallajarla"))
      return "Kovvur Sub-division";
    if (psName.contains("Anaparthi") || psName.contains("Biccavolu") || psName.contains("Rangampeta") || psName.contains("Mandapeta") || psName.contains("Angara") || psName.contains("Rayavaram"))
      return "Mandapeta Sub-division";
    return "East Godavari";
  }

  private int dp(int n) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n, getResources().getDisplayMetrics())); }
  private GradientDrawable shape(int fill, int border) { GradientDrawable d = new GradientDrawable(); d.setColor(fill); d.setCornerRadius(dp(8)); d.setStroke(dp(1), border); return d; }
  private void section(LinearLayout box, String label) { TextView t = addText(box, label, 11); t.setTextColor(Color.rgb(148, 163, 184)); t.setLetterSpacing(0.12f); t.setTypeface(null, 1); t.setPadding(0, dp(16), 0, dp(6)); }
  private TextView addText(LinearLayout box, String s, int size) { TextView v = new TextView(this); v.setText(s); v.setTextSize(size); v.setTextColor(Color.rgb(226, 232, 240)); v.setPadding(0, dp(4), 0, dp(4)); box.addView(v); return v; }

  private EditText field(LinearLayout box, String hint, String value) {
    EditText e = new EditText(this);
    e.setSingleLine(true);
    e.setHint(hint);
    e.setText(value);
    e.setTextSize(14);
    e.setTextColor(Color.WHITE);
    e.setHintTextColor(Color.rgb(148, 163, 184));
    e.setPadding(dp(14), dp(12), dp(14), dp(12));
    e.setBackground(shape(Color.rgb(24, 27, 36), Color.rgb(51, 65, 85)));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.bottomMargin = dp(9);
    box.addView(e, p);
    return e;
  }

  private Button button(LinearLayout box, String label, Runnable action) {
    Button b = new Button(this);
    b.setText(label);
    b.setAllCaps(false);
    b.setTextSize(14);
    b.setTypeface(null, 1);
    boolean primary = label.equals("START DUTY") || label.contains("Save / Confirm");
    boolean sos = label.contains("SOS");
    b.setTextColor(primary ? Color.BLACK : Color.WHITE);
    b.setBackground(shape(primary ? Color.rgb(243, 244, 246) : (sos ? Color.rgb(220, 38, 38) : Color.rgb(30, 41, 59)),
                          sos ? Color.rgb(239, 68, 68) : Color.rgb(71, 85, 105)));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(48));
    p.bottomMargin = dp(9);
    box.addView(b, p);
    b.setOnClickListener(v -> action.run());
    return b;
  }

  private String value(EditText e) { return e == null ? "" : e.getText().toString().trim(); }
  private void work(Runnable r) { io.execute(r); }
  private void note(String s) { ui.post(() -> status.setText(s)); }

  private void saveAssignment() {
    int pos = psSpinner.getSelectedItemPosition();
    String psSelected = pos > 0 ? EAST_GODAVARI_PS[pos] : session.get("ps");
    if (psSelected.isEmpty() || pos == 0) {
      note("Please select a Police Station first");
      return;
    }
    String routeVal = value(route);
    String officerVal = value(officer);
    String mobileVal = value(mobile);
    String sdVal = value(sd);
    if (sdVal.isEmpty()) sdVal = getSubDivision(psSelected);

    session.set("ps", psSelected);
    session.set("sd", sdVal);
    session.set("route", routeVal.isEmpty() ? "Patrol Route 1" : routeVal);
    session.set("officer", officerVal.isEmpty() ? "Duty Officer" : officerVal);
    session.set("mobile", mobileVal);
    session.set("approved", "1");

    work(() -> {
      try {
        if (!session.configured() && !session.get("email").isEmpty()) {
          try { session.signIn(session.get("email"), "Officer@1234"); } catch (Exception ignored) {}
        }
        JSONObject d = new JSONObject()
          .put("sd", session.get("sd"))
          .put("ps", session.get("ps"))
          .put("route", session.get("route"))
          .put("officer", session.get("officer"))
          .put("mobile", session.get("mobile"))
          .put("v", "TRACK Route 2.0 (East Godavari)");
        session.dbPut("devices/" + session.uid(), d);
        note("Saved · " + session.get("ps") + " / " + session.get("route"));
      } catch (Exception e) {
        note("Saved locally · " + session.get("ps"));
      }
    });
  }

  private void askPermissions() {
    java.util.ArrayList<String> p = new java.util.ArrayList<>();
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
      p.add(Manifest.permission.ACCESS_FINE_LOCATION);
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
      p.add(Manifest.permission.RECORD_AUDIO);
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
      p.add(Manifest.permission.POST_NOTIFICATIONS);
    if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED)
      p.add(Manifest.permission.READ_PHONE_STATE);
    if (!p.isEmpty()) requestPermissions(p.toArray(new String[0]), PERMISSION);
  }

  private void refreshDuty() {
    boolean active = session.get("duty").equals("1");
    if (duty != null) {
      duty.setText(active ? "STOP DUTY" : "START DUTY");
      duty.setBackground(shape(active ? Color.rgb(239, 68, 68) : Color.rgb(34, 197, 94), Color.rgb(255, 255, 255)));
      duty.setTextColor(Color.WHITE);
    }
  }

  private void toggleDuty() {
    if (session.get("duty").equals("1")) {
      KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
      if (km != null && km.isDeviceSecure()) {
        startActivityForResult(km.createConfirmDeviceCredentialIntent("Stop TRACK duty", "Confirm device credential to stop sharing location"), STOP);
        return;
      }
      new AlertDialog.Builder(this)
        .setTitle("Stop Duty")
        .setMessage("Are you sure you want to stop tracking?")
        .setNegativeButton("Cancel", null)
        .setPositiveButton("Stop duty", (d, w) -> stopDuty())
        .show();
      return;
    }

    if (psSpinner.getSelectedItemPosition() == 0 && session.get("ps").isEmpty()) {
      note("Select your Police Station before starting duty");
      switchPage(0);
      return;
    }

    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      askPermissions();
      note("Allow precise location, then start duty");
      return;
    }

    android.location.LocationManager lm = (android.location.LocationManager) getSystemService(LOCATION_SERVICE);
    if (lm == null || !lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)) {
      note("Turn on GPS before starting duty");
      startActivity(new Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS));
      return;
    }

    saveAssignment();
    session.set("sessionId", UUID.randomUUID().toString());
    session.set("duty", "1");
    startForegroundService(new Intent(this, TrackService.class));
    queueEvent("start");
    note("Duty active · Tracking started");
    refreshDuty();
  }

  private void stopDuty() {
    stopService(new Intent(this, TrackService.class));
    session.set("duty", "0");
    queueEvent("stop");
    try {
      JSONObject ended = new JSONObject().put("up", 0).put("duty", false).put("gps", false);
      outbox.add("live/" + session.uid(), ended);
      work(() -> { try { outbox.flush(session); } catch (Exception ignored) {} });
    } catch (Exception ignored) {}
    session.set("sessionId", "");
    note("Duty stopped");
    refreshDuty();
  }

  private String id() { return Long.toString(System.currentTimeMillis(), 36) + UUID.randomUUID().toString().substring(0, 8); }

  private void queueEvent(String type) {
    if (session.uid().isEmpty()) return;
    try {
      JSONObject e = new JSONObject()
        .put("type", type)
        .put("uid", session.uid())
        .put("t", System.currentTimeMillis())
        .put("ps", session.get("ps"))
        .put("route", session.get("route"))
        .put("sessionId", session.get("sessionId"));
      if (!session.get("lastLat").isEmpty()) {
        e.put("lat", Double.parseDouble(session.get("lastLat")));
        e.put("lng", Double.parseDouble(session.get("lastLng")));
      }
      String path = "events/" + id();
      outbox.add(path, e);
      work(() -> {
        if (type.equals("sos")) {
          try {
            session.dbPut(path, e);
            outbox.removePath(path);
            note("SOS delivered to Control Room");
          } catch (Exception x) {
            note("SOS queued offline · " + outbox.size() + " pending");
            return;
          }
        }
        try {
          outbox.flush(session);
          if (!type.equals("sos")) note(type.toUpperCase() + " delivered");
        } catch (Exception x) {
          if (!type.equals("sos")) note(type.toUpperCase() + " queued offline");
        }
      });
    } catch (Exception e) { note(e.getMessage()); }
  }

  private void sos() {
    queueEvent("sos");
    note("🚨 SOS SENT TO CONTROL ROOM");
  }

  private void report(String type) {
    if (session.uid().isEmpty()) { note("Set assignment first"); return; }
    try {
      String name = value(station);
      String detail = value(reportNote);
      if (name.isEmpty() && !type.equals("reached") && !type.equals("normal") && !type.equals("tension") && !type.equals("problem")) {
        note("Enter polling station or location");
        return;
      }
      long t = System.currentTimeMillis();
      JSONObject e = new JSONObject()
        .put("type", type.equals("votes") || type.equals("reached") ? type : "loc")
        .put("uid", session.uid())
        .put("t", t)
        .put("ps", session.get("ps"))
        .put("sid", name)
        .put("sname", name)
        .put("note", detail);

      if (!type.equals("votes") && !type.equals("reached")) e.put("status", type);
      if (type.equals("votes") && !value(votes).isEmpty()) e.put("n", Integer.parseInt(value(votes)));
      if (!session.get("lastLat").isEmpty()) {
        e.put("lat", Double.parseDouble(session.get("lastLat")));
        e.put("lng", Double.parseDouble(session.get("lastLng")));
      }

      outbox.add("events/" + id(), e);
      note("Report queued");
      work(() -> {
        try {
          outbox.flush(session);
          note("Report delivered");
        } catch (Exception ex) {
          note("Report queued offline");
        }
      });
    } catch (Exception e) { note("Report failed: " + e.getMessage()); }
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    IntentResult scan = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
    if (scan != null && scan.getContents() != null) {
      try {
        JSONObject q = new JSONObject(scan.getContents());
        if (q.has("ps")) {
          String psVal = q.optString("ps");
          for (int i = 0; i < EAST_GODAVARI_PS.length; i++) {
            if (EAST_GODAVARI_PS[i].equalsIgnoreCase(psVal)) {
              psSpinner.setSelection(i);
              break;
            }
          }
        }
        if (q.has("sd") && sd != null) sd.setText(q.optString("sd"));
        if (q.has("r") && route != null) route.setText(q.optString("r"));
        note("Route QR loaded: " + q.optString("ps"));
      } catch (Exception e) { note("Invalid route QR"); }
      return;
    }

    if (requestCode == STOP) {
      if (resultCode == RESULT_OK) stopDuty();
      else note("Stop Duty cancelled");
      return;
    }

    if (requestCode != PHOTO || resultCode != RESULT_OK || data == null || !(data.getExtras().get("data") instanceof Bitmap)) return;
    try {
      Bitmap b = (Bitmap) data.getExtras().get("data");
      ByteArrayOutputStream stream = new ByteArrayOutputStream();
      b.compress(Bitmap.CompressFormat.JPEG, 75, stream);
      String pid = id();
      long t = System.currentTimeMillis();
      JSONObject photo = new JSONObject()
        .put("uid", session.uid())
        .put("t", t)
        .put("ps", session.get("ps"))
        .put("img", Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP));
      JSONObject event = new JSONObject().put("type", "photo").put("uid", session.uid()).put("t", t).put("pid", pid);
      outbox.add("photos/" + pid, photo);
      outbox.add("events/" + id(), event);
      note("Photo queued");
      work(() -> {
        try {
          outbox.flush(session);
          note("Photo delivered");
        } catch (Exception e) {
          note("Photo queued offline");
        }
      });
    } catch (Exception e) { note("Photo failed: " + e.getMessage()); }
  }

  private void toggleRecording() {
    if (recording) {
      try {
        recorder.stop();
        recorder.release();
        recording = false;
        voice.setText("🎤 Record Voice Message");
        byte[] bytes = Files.readAllBytes(audioFile.toPath());
        if (bytes.length > 900000) {
          note("Recording too large; keep under 1 min");
          return;
        }
        long t = System.currentTimeMillis();
        String vid = id();
        JSONObject v = new JSONObject()
          .put("uid", session.uid())
          .put("a", Base64.encodeToString(bytes, Base64.NO_WRAP))
          .put("mime", "audio/mp4")
          .put("t", t)
          .put("by", session.get("officer"));
        JSONObject e = new JSONObject().put("type", "msg").put("uid", session.uid()).put("t", t).put("voice", vid).put("text", "Voice message from patrol");
        outbox.add("voice/" + vid, v);
        outbox.add("events/" + id(), e);
        note("Voice message queued");
        work(() -> {
          try {
            outbox.flush(session);
            note("Voice message delivered");
          } catch (Exception ex) {
            note("Voice queued offline");
          }
        });
      } catch (Exception e) {
        recording = false;
        note("Recording failed: " + e.getMessage());
      }
      return;
    }

    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      askPermissions();
      note("Allow microphone access");
      return;
    }

    try {
      audioFile = new File(getCacheDir(), "voice.m4a");
      recorder = new MediaRecorder();
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
      recorder.setOutputFile(audioFile.getAbsolutePath());
      recorder.prepare();
      recorder.start();
      recording = true;
      voice.setText("⏹ Stop and Send Recording");
      note("Recording audio…");
    } catch (Exception e) { note("Microphone failed: " + e.getMessage()); }
  }

  private void playVoice() {
    String vid = session.get("lastVoice");
    if (vid.isEmpty()) { note("No voice reply available"); return; }
    work(() -> {
      try {
        JSONObject v = session.dbGet("voice/" + vid);
        byte[] bytes = Base64.decode(v.getString("a"), Base64.DEFAULT);
        File f = new File(getCacheDir(), "reply.m4a");
        Files.write(f.toPath(), bytes);
        ui.post(() -> {
          try {
            android.media.MediaPlayer p = new android.media.MediaPlayer();
            p.setDataSource(f.getAbsolutePath());
            p.prepare();
            p.start();
            p.setOnCompletionListener(android.media.MediaPlayer::release);
            note("Playing dispatch voice audio");
          } catch (Exception e) { note("Playback failed: " + e.getMessage()); }
        });
      } catch (Exception e) { note("Voice download failed"); }
    });
  }

  @Override protected void onResume() {
    super.onResume();
    if (message != null) {
      message.setText(session.get("lastMsg").isEmpty() ? "No new control room messages." : session.get("lastMsg"));
    }
  }

  @Override protected void onDestroy() {
    ui.removeCallbacks(telemetryTick);
    io.shutdown();
    super.onDestroy();
  }
}
