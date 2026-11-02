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
import android.view.View;
import android.view.WindowInsets;
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
    "Peravali PS",
    "Nallajarla PS",
    "Mandapeta town PS",
    "Mandapeta rural PS",
    "Angara PS",
    "Rayavaram PS"
  };

  private static final int PERMISSION = 10, PHOTO = 11, STOP = 12;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Handler ui = new Handler(Looper.getMainLooper());
  private Session session;
  private Outbox outbox;

  // Root view containers for Sign-In screen vs Main App screen
  private LinearLayout signInView;
  private LinearLayout mainAppView;

  // Sign-in inputs
  private Spinner loginPsSpinner, loginRouteSpinner;
  private EditText loginEmail, loginPassword;
  private JSONObject routeCatalog = new JSONObject();
  private final java.util.ArrayList<JSONObject> routeChoices = new java.util.ArrayList<>();
  private boolean signingIn, checkingUpdate;
  private TextView assignmentCard;
  private EditText loginOfficer, loginMobile, loginSd;
  private TextView loginStatus;

  // Main screen components
  private TextView status, message, telemetry, officerBadge;
  private EditText reportNote, votes;
  private Spinner pollingSpinner;
  private JSONObject stationCatalog = new JSONObject();
  private final java.util.ArrayList<JSONObject> pollingChoices = new java.util.ArrayList<>();
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
          ? "Telemetry ready · " + q + " queued"
          : "Battery " + bat + "% · Signal " + session.get("signal") + "/4 · GPS " + session.get("gps") + " · " + q + " queued" + (session.get("syncError").isEmpty() ? "" : " · Upload retry needed"));
      }
      ui.postDelayed(this, 5000);
    }
  };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    session = new Session(this);
    outbox = new Outbox(this);
    try { stationCatalog = new JSONObject(session.get("stationCatalog")); } catch (Exception ignored) { }

    // Auto-configure backend defaults so officers never need to type database URLs or keys
    if (session.get("interval").isEmpty()) session.set("interval", "8000");

    getWindow().setStatusBarColor(Color.rgb(10, 10, 14));
    getWindow().setNavigationBarColor(Color.rgb(15, 15, 20));

    // Master container
    FrameLayout masterLayout = new FrameLayout(this);
    masterLayout.setBackgroundColor(Color.rgb(10, 10, 14));

    // Top inset padding to avoid camera notch/punch-hole
    int topNotchPadding = dp(46);

    // 1. Build Sign-In View
    signInView = buildSignInScreen(topNotchPadding);
    masterLayout.addView(signInView);

    // 2. Build Main App View
    mainAppView = buildMainAppScreen(topNotchPadding);
    masterLayout.addView(mainAppView);

    setContentView(masterLayout);

    // Check if already signed in
    boolean isSignedIn = session.get("signedIn").equals("1") && session.authenticated() && !session.get("ps").isEmpty();
    if (!isSignedIn) { session.set("duty", "0"); stopService(new Intent(this, TrackService.class)); }
    showScreen(isSignedIn);

    refreshDuty();
    askPermissions();
    ui.post(telemetryTick);
    checkForUpdates(false);
  }

  private void showScreen(boolean inMainApp) {
    if (inMainApp) {
      signInView.setVisibility(View.GONE);
      mainAppView.setVisibility(View.VISIBLE);
      updateOfficerBadge();
      refreshPollingChoices();
      if (assignmentCard != null) assignmentCard.setText("Station: " + session.get("ps") + "\nRoute: " + session.get("route") + "\nOfficer: " + session.get("officer"));
      switchPage(0);
    } else {
      mainAppView.setVisibility(View.GONE);
      signInView.setVisibility(View.VISIBLE);
    }
  }

  private void updateOfficerBadge() {
    if (officerBadge != null && session != null) {
      String ps = session.get("ps");
      String rt = session.get("route");
      String off = session.get("officer");
      officerBadge.setText((off.isEmpty() ? "Duty Officer" : off) + "  ·  " + ps + (rt.isEmpty() ? "" : " (" + rt + ")"));
    }
  }

  // ==========================================
  // SCREEN 1: SIGN IN PAGE
  // ==========================================
  private LinearLayout buildSignInScreen(int topPadding) {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(dp(22), topPadding, dp(22), dp(24));
    root.setBackgroundColor(Color.rgb(10, 10, 14));

    ScrollView scroll = new ScrollView(this);
    scroll.setFillViewport(true);
    LinearLayout box = new LinearLayout(this);
    box.setOrientation(LinearLayout.VERTICAL);
    scroll.addView(box);
    root.addView(scroll, new LinearLayout.LayoutParams(-1, -1));

    // Header Badge
    TextView tag = new TextView(this);
    tag.setText("EAST GODAVARI DISTRICT POLICE");
    tag.setTextSize(11);
    tag.setTextColor(Color.rgb(96, 165, 250));
    tag.setTypeface(null, android.graphics.Typeface.BOLD);
    tag.setLetterSpacing(0.12f);
    box.addView(tag);

    TextView title = new TextView(this);
    title.setText("TRACK  /  SIGN IN");
    title.setTextSize(26);
    title.setTextColor(Color.WHITE);
    title.setTypeface(null, android.graphics.Typeface.BOLD);
    title.setLetterSpacing(0.06f);
    title.setPadding(0, dp(4), 0, dp(4));
    box.addView(title);

    TextView desc = new TextView(this);
    desc.setText("Patrol Tracking & Emergency Response System");
    desc.setTextSize(13);
    desc.setTextColor(Color.rgb(156, 163, 175));
    desc.setPadding(0, 0, 0, dp(18));
    box.addView(desc);

    loginStatus = new TextView(this);
    loginStatus.setText("Sign in with your approved email and password to load routes.");
    loginStatus.setTextSize(13);
    loginStatus.setTextColor(Color.rgb(52, 211, 153));
    loginStatus.setPadding(0, 0, 0, dp(14));
    box.addView(loginStatus);

    section(box, "1. SIGN IN TO YOUR ACCOUNT");
    loginEmail = field(box, "Approved email address", session.get("email"));
    loginEmail.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    loginPassword = field(box, "Password", "");
    loginPassword.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
    button(box, "Sign in and load my routes", this::authenticate);
    section(box, "2. SELECT POLICE STATION & ROUTE");
    loginPsSpinner = new Spinner(this);
    ArrayAdapter<String> adapter = spinnerAdapter(java.util.Arrays.asList(EAST_GODAVARI_PS));
    loginPsSpinner.setAdapter(adapter);
    loginPsSpinner.setBackground(shape(Color.rgb(24, 27, 36), Color.rgb(59, 130, 246)));
    loginPsSpinner.setPadding(dp(12), dp(12), dp(12), dp(12));
    LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(50));
    sp.bottomMargin = dp(14);
    box.addView(loginPsSpinner, sp);

    String savedPs = session.get("ps");
    if (!savedPs.isEmpty()) {
      for (int i = 0; i < EAST_GODAVARI_PS.length; i++) {
        if (EAST_GODAVARI_PS[i].equalsIgnoreCase(savedPs)) {
          loginPsSpinner.setSelection(i);
          break;
        }
      }
    }

    loginPsSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
      @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
        if (position > 0) {
          String selected = EAST_GODAVARI_PS[position];
          String subDiv = getSubDivision(selected);
          if (loginSd != null) loginSd.setText(subDiv);
          refreshRouteChoices();
        }
      }
      @Override public void onNothingSelected(AdapterView<?> parent) {}
    });

    section(box, "2. OFFICER & ROUTE DETAILS");
    loginSd = field(box, "Sub-Division", session.get("sd").isEmpty() ? "East Godavari" : session.get("sd"));
    loginRouteSpinner = new Spinner(this);
    box.addView(loginRouteSpinner, new LinearLayout.LayoutParams(-1, dp(52)));
    loginOfficer = field(box, "Officer Name & Rank", session.get("officer"));
    loginMobile = field(box, "Officer Mobile Number", session.get("mobile"));

    section(box, "3. AUTHENTICATION & ENTRY");
    Button enterBtn = new Button(this);
    enterBtn.setText("SIGN IN  ➔  CONTINUE TO DUTY");
    enterBtn.setTextSize(15);
    enterBtn.setTypeface(null, android.graphics.Typeface.BOLD);
    enterBtn.setTextColor(Color.WHITE);
    enterBtn.setBackground(shape(Color.rgb(37, 99, 235), Color.rgb(96, 165, 250)));
    LinearLayout.LayoutParams enterP = new LinearLayout.LayoutParams(-1, dp(52));
    enterP.bottomMargin = dp(10);
    box.addView(enterBtn, enterP);
    enterBtn.setOnClickListener(v -> performSignIn());

    button(box, "📷 Scan Route QR Code", () -> new IntentIntegrator(this).setPrompt("Scan Route QR Assignment").initiateScan());

    return root;
  }

  private void authenticate() {
    if (signingIn) return;
    String email = value(loginEmail), password = loginPassword.getText().toString();
    if (email.isEmpty() || password.isEmpty()) { loginStatus.setText("Enter your approved email and password."); return; }
    signingIn = true; loginStatus.setText("Signing in and loading your assignment…");
    work(() -> {
      try {
        session.signIn(email, password);
        JSONObject available = session.dbGet("config/routes");
        JSONObject sites = session.dbGet("config/stations");
        JSONObject assigned = "route".equals(session.get("role")) ? session.dbGet("assignments/" + session.uid()) : null;
        if (assigned != null && (assigned.optString("ps").isEmpty() || assigned.optString("route").isEmpty()))
          throw new SecurityException("No route assigned to this account. Contact the control room.");
        JSONObject allowed = new JSONObject();
        java.util.Iterator<String> keys = available.keys();
        while (keys.hasNext()) {
          String id = keys.next(); JSONObject r = available.getJSONObject(id);
          if (assigned == null || (assigned.optString("ps").equals(r.optString("ps")) && assigned.optString("route").equals(r.optString("route")))) allowed.put(id, r);
        }
        if (allowed.length() == 0) throw new SecurityException("No matching route in the control-room list. Ask the control room to check your assignment.");
        ui.post(() -> {
          routeCatalog = allowed; stationCatalog = sites;
          session.set("stationCatalog", sites.toString());
          loginPassword.setText("");
          if (assigned != null) {
            for (int i = 1; i < EAST_GODAVARI_PS.length; i++) if (EAST_GODAVARI_PS[i].equals(assigned.optString("ps"))) loginPsSpinner.setSelection(i);
            loginOfficer.setText(assigned.optString("officer")); loginMobile.setText(assigned.optString("mobile"));
          }
          refreshRouteChoices(); loginStatus.setText("Signed in. Select your assigned route, then continue.");
        });
      } catch (Exception e) {
        session.clear();
        ui.post(() -> { routeCatalog = new JSONObject(); refreshRouteChoices(); loginStatus.setText("Sign-in failed: " + e.getMessage()); });
      } finally { ui.post(() -> signingIn = false); }
    });
  }

  private void refreshRouteChoices() {
    if (loginRouteSpinner == null) return;
    routeChoices.clear();
    String selected = EAST_GODAVARI_PS[loginPsSpinner.getSelectedItemPosition()];
    java.util.Iterator<String> keys = routeCatalog.keys();
    while (keys.hasNext()) { JSONObject r = routeCatalog.optJSONObject(keys.next()); if (r != null && selected.equals(r.optString("ps"))) routeChoices.add(r); }
    routeChoices.sort((a,b) -> a.optString("route").compareTo(b.optString("route")));
    java.util.ArrayList<String> labels = new java.util.ArrayList<>();
    for (JSONObject r : routeChoices) labels.add(r.optString("route"));
    if (labels.isEmpty()) labels.add("Sign in and select an assigned station");
    loginRouteSpinner.setAdapter(spinnerAdapter(labels));
    loginRouteSpinner.setEnabled(!routeChoices.isEmpty());
  }

  private ArrayAdapter<String> spinnerAdapter(java.util.List<String> labels) {
    return new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, labels) {
      @Override public View getView(int position, View convert, android.view.ViewGroup parent) {
        View v = super.getView(position, convert, parent);
        if (v instanceof TextView) { ((TextView) v).setTextColor(Color.WHITE); ((TextView) v).setTextSize(14); }
        return v;
      }
    };
  }

  private void refreshPollingChoices() {
    if (pollingSpinner == null) return;
    pollingChoices.clear(); java.util.ArrayList<String> labels = new java.util.ArrayList<>();
    java.util.Iterator<String> keys = stationCatalog.keys();
    while (keys.hasNext()) {
      String id = keys.next(); JSONObject p = stationCatalog.optJSONObject(id);
      if (p != null && session.get("ps").equals(p.optString("ps")) && session.get("route").equals(p.optString("route"))) {
        try { p.put("id", id); } catch (Exception ignored) { }
        pollingChoices.add(p); labels.add(p.optString("name"));
      }
    }
    if (labels.isEmpty()) labels.add("No polling locations assigned to this route");
    pollingSpinner.setAdapter(spinnerAdapter(labels)); pollingSpinner.setEnabled(!pollingChoices.isEmpty());
  }

  private void performSignIn() {
    if (signingIn) return;
    if (!session.authenticated() || routeChoices.isEmpty()) { loginStatus.setText("Sign in and select an assigned route first."); return; }
    JSONObject selected = routeChoices.get(loginRouteSpinner.getSelectedItemPosition());
    String officer = value(loginOfficer), mobile = value(loginMobile);
    if (officer.isEmpty()) { loginStatus.setText("Enter your name and rank."); return; }
    signingIn = true; loginStatus.setText("Registering with the control room…");
    work(() -> {
      try {
        // Do not let a previous account's queued writes block this account's location.
        // Older accounts retain their queue; flush only sends the current account’s records.
        JSONObject d = new JSONObject().put("sd", selected.optString("sd")).put("ps", selected.optString("ps"))
          .put("route", selected.optString("route")).put("officer", officer).put("mobile", mobile)
          .put("force", "route").put("el", selected.optString("election")).put("v", BuildConfig.VERSION_NAME);
        session.dbPut("devices/" + session.uid(), d);
        for (String key : new String[]{"sd", "ps", "route", "officer", "mobile", "el"}) session.set(key, d.optString(key));
        session.set("signedIn", "1"); session.set("approved", "1");
        ui.post(() -> { note("Connected to the control room. Start duty to share location."); showScreen(true); });
      } catch (Exception e) { ui.post(() -> loginStatus.setText("Registration failed: " + e.getMessage())); }
      finally { ui.post(() -> signingIn = false); }
    });
  }

  // ==========================================
  // SCREEN 2: MAIN APP (4 PAGES + BOTTOM NAV)
  // ==========================================
  private LinearLayout buildMainAppScreen(int topPadding) {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.rgb(10, 10, 14));

    // Top Header with notch safety padding
    LinearLayout header = new LinearLayout(this);
    header.setOrientation(LinearLayout.VERTICAL);
    header.setPadding(dp(18), topPadding, dp(18), dp(10));
    header.setBackgroundColor(Color.rgb(15, 17, 23));

    TextView title = new TextView(this);
    title.setText("TRACK  ·  ACTIVE PATROL");
    title.setTextSize(19);
    title.setTextColor(Color.WHITE);
    title.setTypeface(null, android.graphics.Typeface.BOLD);
    title.setLetterSpacing(0.08f);
    header.addView(title);

    officerBadge = new TextView(this);
    officerBadge.setText("East Godavari District Police");
    officerBadge.setTextSize(12);
    officerBadge.setTextColor(Color.rgb(96, 165, 250));
    header.addView(officerBadge);

    telemetry = new TextView(this);
    telemetry.setText("Telemetry starting…");
    telemetry.setTextSize(12);
    telemetry.setTextColor(Color.rgb(52, 211, 153));
    telemetry.setPadding(0, dp(3), 0, 0);
    header.addView(telemetry);

    status = new TextView(this);
    status.setText("Ready for duty");
    status.setTextSize(13);
    status.setTextColor(Color.rgb(209, 213, 219));
    status.setPadding(0, dp(2), 0, 0);
    header.addView(status);

    root.addView(header);

    // 4 Pages Container
    FrameLayout container = new FrameLayout(this);
    LinearLayout.LayoutParams containerParams = new LinearLayout.LayoutParams(-1, 0, 1.0f);
    root.addView(container, containerParams);

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
    navBar.setPadding(dp(4), dp(6), dp(4), dp(8));

    String[] navTitles = {"Duty", "SOS", "Polling", "Comms"};
    for (int i = 0; i < 4; i++) {
      final int pageIndex = i;
      Button b = new Button(this);
      b.setText(navTitles[i]);
      b.setTextSize(13);
      b.setTypeface(null, android.graphics.Typeface.BOLD);
      b.setAllCaps(false);
      LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, dp(46), 1.0f);
      p.setMargins(dp(2), 0, dp(2), 0);
      b.setLayoutParams(p);
      b.setOnClickListener(v -> switchPage(pageIndex));
      navButtons[i] = b;
      navBar.addView(b);
    }
    root.addView(navBar);

    return root;
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

    section(box, "ACTIVE PATROL CONTROL");
    duty = new Button(this);
    duty.setText("START DUTY");
    duty.setTextSize(16);
    duty.setTypeface(null, android.graphics.Typeface.BOLD);
    duty.setTextColor(Color.WHITE);
    duty.setBackground(shape(Color.rgb(34, 197, 94), Color.rgb(255, 255, 255)));
    LinearLayout.LayoutParams dpParam = new LinearLayout.LayoutParams(-1, dp(58));
    dpParam.bottomMargin = dp(14);
    box.addView(duty, dpParam);
    duty.setOnClickListener(v -> toggleDuty());

    section(box, "CURRENT PATROL ASSIGNMENT");
    TextView unitCard = new TextView(this);
    assignmentCard = unitCard;
    unitCard.setText("Station: " + session.get("ps") + "\nRoute: " + session.get("route") + "\nOfficer: " + session.get("officer"));
    unitCard.setTextSize(14);
    unitCard.setTextColor(Color.WHITE);
    unitCard.setBackground(shape(Color.rgb(24, 27, 36), Color.rgb(51, 65, 85)));
    unitCard.setPadding(dp(14), dp(14), dp(14), dp(14));
    LinearLayout.LayoutParams ucP = new LinearLayout.LayoutParams(-1, -2);
    ucP.bottomMargin = dp(14);
    box.addView(unitCard, ucP);

    section(box, "OFFICER SESSION & UPDATES");
    button(box, "Switch Officer / Change Police Station", () -> {
      if (session.get("duty").equals("1")) {
        note("Stop Duty before switching accounts");
        return;
      }
      session.clear();
      routeCatalog = new JSONObject(); refreshRouteChoices();
      showScreen(false);
    });
    button(box, "🚀 Check for App Updates", () -> checkForUpdates(true));

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
    sosBtn.setTypeface(null, android.graphics.Typeface.BOLD);
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
    pollingSpinner = new Spinner(this);
    box.addView(pollingSpinner, new LinearLayout.LayoutParams(-1, dp(60)));
    votes = field(box, "Cumulative Votes Polled (Turnout)", "");
    votes.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
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
  private void section(LinearLayout box, String label) { TextView t = addText(box, label, 11); t.setTextColor(Color.rgb(148, 163, 184)); t.setLetterSpacing(0.12f); t.setTypeface(null, android.graphics.Typeface.BOLD); t.setPadding(0, dp(16), 0, dp(6)); }
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
    b.setTypeface(null, android.graphics.Typeface.BOLD);
    boolean sos = label.contains("SOS");
    b.setTextColor(Color.WHITE);
    b.setBackground(shape(sos ? Color.rgb(220, 38, 38) : Color.rgb(30, 41, 59),
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
  private void checkForUpdates(boolean userInitiated) {
    if (checkingUpdate) return;
    checkingUpdate = true;
    if (userInitiated) note("Checking for updates…");
    work(() -> {
      java.net.HttpURLConnection conn = null;
      try {
        conn = (java.net.HttpURLConnection) new java.net.URL("https://raw.githubusercontent.com/abdulaleemarshad1979/TRACE/main/version.json").openConnection();
        conn.setConnectTimeout(8000); conn.setReadTimeout(8000); conn.setUseCaches(false);
        conn.setRequestProperty("Cache-Control", "no-cache");
        if (conn.getResponseCode() != 200) throw new java.io.IOException("Update server unavailable");
        JSONObject v;
        try (java.io.InputStream in = conn.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
          byte[] buf = new byte[4096]; int n;
          while ((n = in.read(buf)) != -1) { out.write(buf, 0, n); if (out.size() > 65536) throw new java.io.IOException("Invalid update manifest"); }
          v = new JSONObject(out.toString("UTF-8"));
        }
        int remoteCode = v.getInt("versionCode");
        String apkUrl = v.getString("apkUrl");
        if (!UpdatePolicy.validDownloadUrl(apkUrl) || remoteCode <= 0) throw new java.io.IOException("Invalid update manifest");
        if (UpdatePolicy.isNewer(BuildConfig.VERSION_CODE, remoteCode)) {
          if (userInitiated || !session.get("dismissedUpdate").equals(String.valueOf(remoteCode)))
            ui.post(() -> { if (!isFinishing() && !isDestroyed()) showUpdateDialog(v.optString("versionName"), v.optString("releaseNotes"), apkUrl, remoteCode); });
        } else if (userInitiated) note("TRACK is up to date (v" + BuildConfig.VERSION_NAME + ")");
      } catch (Exception e) { if (userInitiated) note("Could not check for updates. Check your internet connection and try again."); }
      finally { if (conn != null) conn.disconnect(); ui.post(() -> checkingUpdate = false); }
    });
  }

  private void showUpdateDialog(String versionName, String notes, String apkUrl, int remoteCode) {
    new AlertDialog.Builder(this)
      .setTitle("🚀 Update Available (v" + versionName + ")")
      .setMessage(notes + "\n\nA new update is ready on GitHub. Would you like to update now?")
      .setCancelable(true)
      .setPositiveButton("Update Now", (d, w) -> {
        try {
          Intent intent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(apkUrl));
          startActivity(intent);
        } catch (Exception e) {
          note("Error opening updater: " + e.getMessage());
        }
      })
      .setNegativeButton("Later", (d, w) -> session.set("dismissedUpdate", String.valueOf(remoteCode)))
      .show();
  }

  private void askPermissions() {
    java.util.ArrayList<String> p = new java.util.ArrayList<>();
    if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      p.add(Manifest.permission.ACCESS_FINE_LOCATION);
      p.add(Manifest.permission.ACCESS_COARSE_LOCATION);
    }
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

    if (!session.authenticated() || session.get("ps").isEmpty()) {
      note("Police Station not set. Sign in first.");
      showScreen(false);
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

    session.set("sessionId", UUID.randomUUID().toString());
    session.set("duty", "1");
    startForegroundService(new Intent(this, TrackService.class));
    queueEvent("start");
    note("Duty active · Tracking started");
    refreshDuty();
  }

  private void stopDuty() {
    session.set("duty", "0");
    stopService(new Intent(this, TrackService.class));
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
    note("SOS queued; waiting for delivery confirmation");
  }

  private void report(String type) {
    if (session.uid().isEmpty()) { note("Sign in first"); return; }
    try {
      JSONObject location = pollingChoices.isEmpty() ? new JSONObject() : pollingChoices.get(pollingSpinner.getSelectedItemPosition());
      String name = location.optString("name");
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
        .put("sid", location.optString("id"))
        .put("sname", name)
        .put("note", detail);

      if (!type.equals("votes") && !type.equals("reached")) e.put("status", type);
      if (type.equals("votes")) {
        int count = Integer.parseInt(value(votes));
        if (count < 0) throw new IllegalArgumentException("Votes cannot be negative");
        e.put("n", count);
      }
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
              if (loginPsSpinner != null) loginPsSpinner.setSelection(i);
              break;
            }
          }
        }
        if (q.has("sd") && loginSd != null) loginSd.setText(q.optString("sd"));
        refreshRouteChoices();
        for (int i = 0; i < routeChoices.size(); i++) if (routeChoices.get(i).optString("route").equals(q.optString("r"))) loginRouteSpinner.setSelection(i);
        if (loginStatus != null) loginStatus.setText("Route QR loaded: " + q.optString("ps"));
      } catch (Exception e) {
        if (loginStatus != null) loginStatus.setText("Invalid route QR");
      }
      return;
    }

    if (requestCode == STOP) {
      if (resultCode == RESULT_OK) stopDuty();
      else note("Stop Duty cancelled");
      return;
    }

    if (requestCode != PHOTO || resultCode != RESULT_OK || data == null || data.getExtras() == null || !(data.getExtras().get("data") instanceof Bitmap)) return;
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
