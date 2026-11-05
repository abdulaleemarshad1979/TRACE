package org.trace.monitor;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintManager;
import android.provider.Settings;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.json.JSONObject;

public final class MainActivity extends Activity {
  private static final String HOST = "appassets.androidplatform.net";
  private static final String HOME = "https://" + HOST + "/assets/index.html";
  private static final String CHANNEL = "monitor_alerts";
  private static final String UPDATE_MANIFEST = "https://raw.githubusercontent.com/abdulaleemarshad1979/TRACK/main/monitor-version.json";
  private static final String UPDATE_APK = "https://raw.githubusercontent.com/abdulaleemarshad1979/TRACK/main/release/Trace-Monitor.apk";
  private static final int MICROPHONE_REQUEST = 41;
  private static final int NOTIFICATION_REQUEST = 42;
  private static final int SAVE_REQUEST = 43;
  private static final int LOCATION_REQUEST = 44;
  private WebView web;
  private ProgressBar progress;
  private PermissionRequest pendingMicrophone;
  private byte[] pendingSave;
  private String pendingSaveName;
  private int notificationId;
  private boolean requestedNotifications;
  private String[] pendingViewer;
  private final ExecutorService background = Executors.newSingleThreadExecutor();
  private final android.os.Handler ui = new android.os.Handler(android.os.Looper.getMainLooper());
  private boolean checkingUpdate;
  private long lastUpdateCheck;
  private int shownUpdateCode;
  private File pendingUpdate;
  private final Runnable updateTick = new Runnable() { @Override public void run() { checkForUpdates(false); ui.postDelayed(this, 6 * 60 * 60 * 1000L); } };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    getWindow().setStatusBarColor(Color.rgb(18, 29, 45));
    getWindow().setNavigationBarColor(Color.rgb(18, 29, 45));
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.rgb(241, 244, 248));
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    if (Build.VERSION.SDK_INT >= 35) root.setOnApplyWindowInsetsListener((view, insets) -> {
      android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
      view.setPadding(0, bars.top, 0, bars.bottom);
      return insets;
    });
    web = new WebView(this);
    progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
    progress.setMax(100);
    FrameLayout.LayoutParams bar = new FrameLayout.LayoutParams(-1, dp(3));
    root.addView(web);
    root.addView(progress, bar);
    setContentView(root);

    web.getSettings().setJavaScriptEnabled(true);
    web.getSettings().setDomStorageEnabled(true);
    web.getSettings().setDatabaseEnabled(true);
    web.getSettings().setGeolocationEnabled(true);
    web.getSettings().setMediaPlaybackRequiresUserGesture(false);
    web.getSettings().setSupportMultipleWindows(true);
    web.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
    web.getSettings().setAllowFileAccess(false);
    web.getSettings().setAllowContentAccess(false);
    web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    CookieManager.getInstance().setAcceptCookie(true);
    web.addJavascriptInterface(new Bridge(), "Android");
    web.setWebViewClient(new WebViewClient() {
      @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/assets/")) return missing();
        String asset = path.substring("/assets/".length());
        if (asset.isEmpty()) asset = "index.html";
        if (!asset.equals("index.html") && !asset.equals("si-monitor.html") && !asset.equals("assets/ballot.png")) return missing();
        try {
          InputStream input = getAssets().open(asset);
          String mime = asset.endsWith(".png") ? "image/png" : "text/html";
          return new WebResourceResponse(mime, "UTF-8", input);
        } catch (Exception ignored) { return missing(); }
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame()) return false;
        return route(request.getUrl());
      }
      @Override public void onPageFinished(WebView view, String url) { progress.setVisibility(android.view.View.GONE); }
      @Override public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
        if (request.isForMainFrame()) toast("Page could not load. Tap Back and reopen Trace Monitor.");
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onProgressChanged(WebView view, int value) {
        progress.setProgress(value);
        progress.setVisibility(value == 100 ? android.view.View.GONE : android.view.View.VISIBLE);
      }
      @Override public void onPermissionRequest(PermissionRequest request) {
        runOnUiThread(() -> {
          Uri origin = request.getOrigin();
          boolean trusted = "https".equals(origin.getScheme()) && HOST.equals(origin.getHost());
          boolean audio = false;
          for (String resource : request.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio = true;
          if (!trusted || !audio) { request.deny(); return; }
          if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
          else { pendingMicrophone = request; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_REQUEST); }
        });
      }
      @Override public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
        // The installed app uses the native foreground service for viewer tracking.
        callback.invoke(origin, false, false);
      }
      @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
        WebView child = new WebView(MainActivity.this);
        child.setWebViewClient(new WebViewClient() {
          @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
            route(request.getUrl());
            v.post(v::destroy);
            return true;
          }
        });
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(child);
        resultMsg.sendToTarget();
        return true;
      }
    });
    web.setDownloadListener((url, userAgent, disposition, mime, size) -> {
      if (url.startsWith("data:")) saveDataUrl(url, fileName(disposition, mime));
      else if (url.startsWith("https://")) download(url, userAgent, fileName(disposition, mime), mime);
    });
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = new NotificationChannel(CHANNEL, "Monitor alerts", NotificationManager.IMPORTANCE_HIGH);
      ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
    }
    web.loadUrl(HOME);
    ui.postDelayed(updateTick, 2000);
  }

  private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }
  private WebResourceResponse missing() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }
  private boolean route(Uri uri) {
    if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) {
      String path = uri.getPath();
      if ("/assets/".equals(path) || "/assets".equals(path)) web.loadUrl(HOME);
      else if ("/assets/index.html".equals(path) || "/assets/si-monitor.html".equals(path)) web.loadUrl(uri.toString());
      return true;
    }
    if ("https".equals(uri.getScheme())) {
      String host = uri.getHost();
      boolean maps = "maps.google.com".equals(host) || ("www.google.com".equals(host) && uri.getPath() != null && uri.getPath().startsWith("/maps"));
      if (!maps && !"wa.me".equals(host)) return true;
    } else if (!"tel".equals(uri.getScheme()) && !"mailto".equals(uri.getScheme())) return true;
    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception e) { toast("No app can open this link."); }
    return true;
  }
  private String fileName(String disposition, String mime) {
    String name = null;
    if (disposition != null) {
      java.util.regex.Matcher match = java.util.regex.Pattern.compile("filename=\\\"?([^\\\";]+)").matcher(disposition);
      if (match.find()) name = match.group(1);
    }
    if (name == null) name = "Trace-Monitor-" + System.currentTimeMillis() + ("image/jpeg".equals(mime) ? ".jpg" : ".bin");
    return name.replaceAll("[^a-zA-Z0-9._ -]", "_");
  }
  private void download(String url, String agent, String name, String mime) {
    try {
      DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
      req.setTitle(name);
      req.setMimeType(mime);
      req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
      req.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name);
      req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) == null ? "" : CookieManager.getInstance().getCookie(url));
      req.addRequestHeader("User-Agent", agent);
      ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
      toast("Download started");
    } catch (Exception e) { toast("Download failed"); }
  }
  private void saveDataUrl(String dataUrl, String name) {
    try {
      int comma = dataUrl.indexOf(',');
      if (comma < 0 || !dataUrl.substring(0, comma).contains(";base64")) throw new IllegalArgumentException();
      String mime = dataUrl.substring(5, dataUrl.indexOf(';'));
      save(name, mime, Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT));
    } catch (Exception e) { toast("Could not save this file"); }
  }
  private void save(String name, String mime, byte[] bytes) {
    runOnUiThread(() -> {
      try {
        if (Build.VERSION.SDK_INT >= 29) {
          android.content.ContentValues values = new android.content.ContentValues();
          values.put(MediaStore.Downloads.DISPLAY_NAME, name);
          values.put(MediaStore.Downloads.MIME_TYPE, mime);
          values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Trace Monitor");
          Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
          if (uri == null) throw new IllegalStateException();
          try (OutputStream out = getContentResolver().openOutputStream(uri)) { if (out == null) throw new IllegalStateException(); out.write(bytes); }
          toast("Saved to Downloads/Trace Monitor");
        } else {
          pendingSave = bytes;
          pendingSaveName = name;
          Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
          startActivityForResult(intent, SAVE_REQUEST);
        }
      } catch (Exception e) { toast("Could not save file"); }
    });
  }
  @Override protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request == SAVE_REQUEST) {
      if (result == RESULT_OK && data != null && pendingSave != null) {
        try (OutputStream out = getContentResolver().openOutputStream(data.getData())) { if (out != null) { out.write(pendingSave); toast("Saved " + pendingSaveName); } }
        catch (Exception e) { toast("Could not save file"); }
      }
      pendingSave = null;
      pendingSaveName = null;
    }
  }
  @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
    super.onRequestPermissionsResult(code, permissions, results);
    if (code == MICROPHONE_REQUEST && pendingMicrophone != null) {
      PermissionRequest request = pendingMicrophone;
      pendingMicrophone = null;
      if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
      else request.deny();
    }
    if (code == LOCATION_REQUEST && pendingViewer != null) {
      String[] viewer = pendingViewer;
      pendingViewer = null;
      if (hasLocationPermission()) launchViewerService(viewer);
      else toast("Location permission is needed to show this viewer on the control room map.");
    }
  }
  private boolean hasLocationPermission() {
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }
  private void launchViewerService(String[] viewer) {
    try {
      java.net.URI database = new java.net.URI(viewer[3]);
      if (!viewer[0].matches("[A-Za-z0-9_-]{6,128}") || !viewer[2].equals(BuildConfig.FIREBASE_API_KEY)
        || viewer[1].isEmpty() || !viewer[3].replaceAll("/+$", "").equals(BuildConfig.FIREBASE_DATABASE_URL)
        || !"https".equals(database.getScheme()) || database.getHost() == null
        || !database.getHost().endsWith(".firebasedatabase.app") || database.getPort() != -1
        || database.getUserInfo() != null || (database.getPath() != null && !database.getPath().isEmpty() && !"/".equals(database.getPath()))) throw new IllegalArgumentException();
      SharedPreferences prefs = getSharedPreferences(ViewerLocationService.PREFS, MODE_PRIVATE);
      prefs.edit().putBoolean("enabled", true).putString("uid", viewer[0]).putString("refresh", viewer[1])
        .putString("key", viewer[2]).putString("database", viewer[3].replaceAll("/+$", "")).commit();
      startForegroundService(new Intent(this, ViewerLocationService.class));
      ui.postDelayed(this::requestNotifications, 500);
    } catch (Exception e) { getSharedPreferences(ViewerLocationService.PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply(); toast("Could not start background location sharing."); }
  }
  private void checkForUpdates(boolean manual) {
    if (checkingUpdate || (!manual && System.currentTimeMillis() - lastUpdateCheck < 60 * 60 * 1000L)) return;
    checkingUpdate = true;
    lastUpdateCheck = System.currentTimeMillis();
    if (manual) toast("Checking for Trace Monitor updates…");
    background.execute(() -> {
      HttpURLConnection connection = null;
      try {
        connection = (HttpURLConnection) new URL(UPDATE_MANIFEST).openConnection();
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-cache");
        if (connection.getResponseCode() != 200) throw new java.io.IOException("Update information unavailable");
        JSONObject manifest;
        try (InputStream input = connection.getInputStream()) { manifest = new JSONObject(readUpdate(input, 65536)); }
        int code = manifest.getInt("versionCode");
        String url = manifest.getString("apkUrl"), hash = manifest.getString("sha256");
        if (!UPDATE_APK.equals(url) || !hash.matches("[0-9a-fA-F]{64}") || code <= 0) throw new java.io.IOException("Invalid update information");
        if (code > BuildConfig.VERSION_CODE && (manual || code != shownUpdateCode)) {
          shownUpdateCode = code;
          ui.post(() -> {
            if (isFinishing() || isDestroyed()) return;
            new AlertDialog.Builder(this).setTitle("Trace Monitor update available")
              .setMessage("Version " + manifest.optString("versionName", "new") + " is ready. " + manifest.optString("releaseNotes", ""))
              .setPositiveButton("Download update", (dialog, which) -> downloadUpdate(url, hash))
              .setNegativeButton("Later", null).show();
          });
        } else if (manual) toast("Trace Monitor is up to date.");
      } catch (Exception e) { if (manual) toast("Could not check for updates. Check your connection."); }
      finally { if (connection != null) connection.disconnect(); ui.post(() -> checkingUpdate = false); }
    });
  }
  private static String readUpdate(InputStream input, int limit) throws Exception {
    java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
    byte[] buffer = new byte[8192]; int count;
    while ((count = input.read(buffer)) != -1) { if (output.size() + count > limit) throw new java.io.IOException("Update too large"); output.write(buffer, 0, count); }
    return output.toString("UTF-8");
  }
  private void downloadUpdate(String url, String expectedHash) {
    toast("Downloading verified update…");
    background.execute(() -> {
      HttpURLConnection connection = null;
      File file = new File(new File(getCacheDir(), "updates"), "trace-monitor-update.apk");
      try {
        if (!UPDATE_APK.equals(url)) throw new java.io.IOException("Invalid update address");
        if (!file.getParentFile().isDirectory() && !file.getParentFile().mkdirs()) throw new java.io.IOException("Cannot create update folder");
        connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(12000); connection.setReadTimeout(30000);
        if (connection.getResponseCode() != 200) throw new java.io.IOException("Update download unavailable");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long size = 0;
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
          byte[] buffer = new byte[8192]; int count;
          while ((count = input.read(buffer)) != -1) { size += count; if (size > 50000000) throw new java.io.IOException("Update file too large"); digest.update(buffer, 0, count); output.write(buffer, 0, count); }
        }
        StringBuilder actual = new StringBuilder();
        for (byte value : digest.digest()) actual.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        if (size < 100000 || !actual.toString().equalsIgnoreCase(expectedHash)) throw new java.io.IOException("Update verification failed");
        pendingUpdate = file;
        ui.post(this::openUpdateInstaller);
      } catch (Exception e) { file.delete(); toast("Update failed: " + e.getMessage()); }
      finally { if (connection != null) connection.disconnect(); }
    });
  }
  private void openUpdateInstaller() {
    if (pendingUpdate == null || !pendingUpdate.isFile() || isFinishing()) return;
    if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
      toast("Allow Trace Monitor to install updates, then return to the app.");
      startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
      return;
    }
    try {
      Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", pendingUpdate);
      Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      startActivity(install);
      pendingUpdate = null;
    } catch (Exception e) { toast("Could not open Android installer."); }
  }
  @Override protected void onResume() {
    super.onResume();
    if (pendingUpdate != null && pendingUpdate.isFile() && (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) ui.postDelayed(this::openUpdateInstaller, 300);
  }
  private void toast(String message) { runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }
  private void requestNotifications() {
    runOnUiThread(() -> {
      if (!requestedNotifications && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
        requestedNotifications = true;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
      }
    });
  }
  @Override public void onBackPressed() {
    if (web.canGoBack()) web.goBack(); else super.onBackPressed();
  }
  @Override protected void onDestroy() { ui.removeCallbacks(updateTick); background.shutdown(); web.destroy(); super.onDestroy(); }

  private final class Bridge {
    @JavascriptInterface public void setAuth(String key, String database, String token, String email) { requestNotifications(); }
    @JavascriptInterface public void setAuth(String key, String database, String token, String email, String uid, String project, String sender, String appId) { requestNotifications(); }
    @JavascriptInterface public void signOut() { }
    @JavascriptInterface public void setAlerts(String prefs) { }
    @JavascriptInterface public void checkForUpdates() { runOnUiThread(() -> MainActivity.this.checkForUpdates(true)); }
    @JavascriptInterface public void startViewerTracking(String uid, String refresh, String key, String database) {
      runOnUiThread(() -> {
        String[] viewer = { uid, refresh, key, database };
        if (hasLocationPermission()) launchViewerService(viewer);
        else { pendingViewer = viewer; requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST); }
      });
    }
    @JavascriptInterface public void updateViewerToken(String uid, String refresh) {
      SharedPreferences prefs = getSharedPreferences(ViewerLocationService.PREFS, MODE_PRIVATE);
      if (prefs.getBoolean("enabled", false) && uid.equals(prefs.getString("uid", ""))) prefs.edit().putString("refresh", refresh).apply();
    }
    @JavascriptInterface public boolean isViewerTracking() {
      return pendingViewer != null || getSharedPreferences(ViewerLocationService.PREFS, MODE_PRIVATE).getBoolean("enabled", false);
    }
    @JavascriptInterface public void stopViewerTracking() {
      runOnUiThread(() -> {
        pendingViewer = null;
        if (getSharedPreferences(ViewerLocationService.PREFS, MODE_PRIVATE).getBoolean("enabled", false))
          startService(new Intent(MainActivity.this, ViewerLocationService.class).setAction(ViewerLocationService.ACTION_STOP));
      });
    }
    @JavascriptInterface public void print() {
      runOnUiThread(() -> {
        PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        manager.print("Trace Monitor", web.createPrintDocumentAdapter("Trace Monitor"), null);
      });
    }
    @JavascriptInterface public void saveFile(String name, String base64) {
      try { save(fileName("filename=" + name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Base64.decode(base64, Base64.DEFAULT)); }
      catch (Exception e) { toast("Could not save spreadsheet"); }
    }
    @JavascriptInterface public void notify(String title, String body) {
      runOnUiThread(() -> {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
          requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
          return;
        }
        Notification notification = new Notification.Builder(MainActivity.this, CHANNEL)
          .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body)
          .setStyle(new Notification.BigTextStyle().bigText(body)).setAutoCancel(true)
          .setContentIntent(PendingIntent.getActivity(MainActivity.this, 0, new Intent(MainActivity.this, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build();
        ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(++notificationId, notification);
      });
    }
  }
}
