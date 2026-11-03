package org.trace.route;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;
import java.util.ArrayList;

final class Outbox extends SQLiteOpenHelper {
  private final Object flushGate = new Object();
  Outbox(Context c) { super(c, "trace-outbox.db", null, 1); }
  @Override public void onCreate(SQLiteDatabase db) { db.execSQL("CREATE TABLE pending (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, json TEXT NOT NULL)"); }
  @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }
  synchronized void add(String path, Object body) {
    if (path.startsWith("live/")) getWritableDatabase().delete("pending", "path=?", new String[]{path});
    android.content.ContentValues v = new android.content.ContentValues(); v.put("path", path); v.put("json", body.toString());
    getWritableDatabase().insertOrThrow("pending", null, v);
  }
  synchronized int size() {
    try (Cursor c = getReadableDatabase().rawQuery("SELECT count(*) FROM pending", null)) { c.moveToFirst(); return c.getInt(0); }
  }
  synchronized void removePath(String path) {
    getWritableDatabase().delete("pending", "path=?", new String[]{path});
  }
  void flush(Session session) throws Exception { flush(session, Integer.MAX_VALUE); }
  void flush(Session session, int maxWrites) throws Exception {
    synchronized (flushGate) {
      int sent = 0;
      int target = Math.min(maxWrites, size());
      while (sent < target) {
        ArrayList<Pending> batch = pendingFor(session, Math.min(50, target - sent));
        if (batch.isEmpty()) break;
        for (Pending item : batch) {
          try { session.dbPut(item.path, item.json.startsWith("[") ? new org.json.JSONArray(item.json) : new JSONObject(item.json)); }
          catch (Exception writeError) {
            if (!item.path.startsWith("events/") || !sameEvent(session.dbGet(item.path), new JSONObject(item.json))) throw writeError;
          }
          getWritableDatabase().delete("pending", "id=?", new String[]{String.valueOf(item.id)});
          sent++;
        }
      }
    }
  }
  private ArrayList<Pending> pendingFor(Session session, int limit) throws Exception {
    ArrayList<Pending> batch = new ArrayList<>();
    try (Cursor c = getReadableDatabase().rawQuery("SELECT id,path,json FROM pending ORDER BY CASE WHEN path LIKE 'live/%' THEN 0 WHEN path LIKE 'track/%' THEN 2 ELSE 1 END,id", null)) {
      while (batch.size() < limit && c.moveToNext()) {
        String path = c.getString(1), json = c.getString(2);
        if (path.startsWith("live/") || path.startsWith("track/")) {
          if (!path.split("/")[1].equals(session.uid())) continue;
        } else if (!new JSONObject(json).optString("uid").equals(session.uid())) continue;
        batch.add(new Pending(c.getLong(0), path, json));
      }
    }
    return batch;
  }
  private static final class Pending {
    final long id;
    final String path, json;
    Pending(long id, String path, String json) { this.id = id; this.path = path; this.json = json; }
  }
  private boolean sameEvent(JSONObject stored, JSONObject queued) {
    return !stored.isNull("uid") && stored.optString("uid").equals(queued.optString("uid"))
      && stored.optString("type").equals(queued.optString("type")) && stored.optLong("t", -1) == queued.optLong("t", -2);
  }
}
