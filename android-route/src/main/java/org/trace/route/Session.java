package org.trace.route;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class Session {
  private final SharedPreferences prefs;
  private String idToken = "";
  private long expiry = 0;
  Session(Context c) { prefs = c.getSharedPreferences("trace", Context.MODE_PRIVATE); }
  String get(String key) {
    String value = prefs.getString(key, "");
    if (!value.isEmpty()) return value;
    if (key.equals("key")) return BuildConfig.STAGING_API_KEY;
    if (key.equals("db")) return BuildConfig.STAGING_DATABASE_URL;
    return value;
  }
  void set(String key, String value) { prefs.edit().putString(key, value).apply(); }
  String uid() {
    return get("uid");
  }
  boolean authenticated() { return !get("refresh").isEmpty() && !uid().isEmpty() && !get("role").isEmpty(); }

  boolean configured() { return !get("key").isEmpty() && get("db").startsWith("https://"); }
  void configure(String key, String db) {
    if (!db.startsWith("https://")) throw new IllegalArgumentException("Database URL must use HTTPS");
    set("key", key.trim()); set("db", db.replaceAll("/+$", "").trim());
  }
  synchronized void signIn(String email, String password) throws Exception {
    JSONObject body = new JSONObject().put("email", email).put("password", password).put("returnSecureToken", true);
    JSONObject j = request("POST", "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + enc(get("key")), body.toString());
    idToken = j.getString("idToken"); expiry = System.currentTimeMillis() + j.optLong("expiresIn", 3600) * 1000;
    set("refresh", j.getString("refreshToken")); set("uid", j.getString("localId")); set("email", email);
    String role = dbGet("roles/" + uid()).optString("value");
    if (!"route".equals(role) && !"admin".equals(role)) { clear(); throw new SecurityException("This account is not approved for route duty. Contact the control room."); }
    set("role", role);
  }
  void clear() { prefs.edit().remove("refresh").remove("uid").remove("email").remove("approved").remove("role").remove("signedIn").apply(); idToken = ""; }
  synchronized String token() throws Exception {
    if (!idToken.isEmpty() && System.currentTimeMillis() < expiry - 120000) return idToken;
    if (get("refresh").isEmpty()) throw new SecurityException("Sign in with your approved email and password first.");
    String form = "grant_type=refresh_token&refresh_token=" + enc(get("refresh"));
    JSONObject j = request("POST", "https://securetoken.googleapis.com/v1/token?key=" + enc(get("key")), form);
    idToken = j.getString("id_token"); expiry = System.currentTimeMillis() + j.optLong("expires_in", 3600) * 1000;
    set("refresh", j.getString("refresh_token")); set("uid", j.getString("user_id")); return idToken;
  }
  JSONObject dbGet(String path) throws Exception {
    String t = token();
    String authSuffix = t.isEmpty() ? "" : "?auth=" + enc(t);
    String raw = requestRaw("GET", get("db") + "/" + path + ".json" + authSuffix, null);
    if (raw.equals("null") || raw.trim().isEmpty()) return new JSONObject();
    if (raw.startsWith("\"")) return new JSONObject().put("value", new org.json.JSONTokener(raw).nextValue());
    JSONObject j = new JSONObject(raw); return j;
  }
  void dbPut(String path, Object body) throws Exception {
    String t = token();
    String authSuffix = t.isEmpty() ? "" : "?auth=" + enc(t);
    requestRaw("PUT", get("db") + "/" + path + ".json" + authSuffix, body.toString());
  }
  private static JSONObject request(String method, String url, String body) throws Exception { return new JSONObject(requestRaw(method, url, body)); }
  private static String requestRaw(String method, String url, String body) throws Exception {
    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
    c.setRequestMethod(method); c.setConnectTimeout(12000); c.setReadTimeout(12000);
    if (body != null) {
      c.setDoOutput(true); c.setRequestProperty("Content-Type", body.startsWith("grant_type=") ? "application/x-www-form-urlencoded" : "application/json");
      try (OutputStream out = c.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
    }
    int code = c.getResponseCode();
    try (InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream()) {
      ByteArrayOutputStream buffer = new ByteArrayOutputStream(); byte[] chunk = new byte[8192]; int n;
      if (in == null) throw new Exception("Server returned HTTP " + code);
      while ((n = in.read(chunk)) != -1) buffer.write(chunk, 0, n);
      String result = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
      if (code >= 400) throw new Exception("HTTP " + code + ": " + result.substring(0, Math.min(result.length(), 180)));
      return result;
    } finally { c.disconnect(); }
  }
  private static String enc(String s) { try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { throw new IllegalStateException(e); } }
}
