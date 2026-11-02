package org.trace.route;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONObject;

final class Outbox extends SQLiteOpenHelper {
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
  synchronized void flush(Session session) throws Exception {
    try (Cursor c = getReadableDatabase().rawQuery("SELECT id,path,json FROM pending ORDER BY id", null)) {
      while (c.moveToNext()) {
        String path = c.getString(1), json = c.getString(2);
        if (path.startsWith("live/") || path.startsWith("track/")) {
          if (!path.split("/")[1].equals(session.uid())) continue;
        } else if (!new JSONObject(json).optString("uid").equals(session.uid())) continue;
        try { session.dbPut(path, json.startsWith("[") ? new org.json.JSONArray(json) : new JSONObject(json)); }
        catch (Exception writeError) {
          if (!path.startsWith("events/") || !sameEvent(session.dbGet(path), new JSONObject(json))) throw writeError;
        }
        getWritableDatabase().delete("pending", "id=?", new String[]{String.valueOf(c.getLong(0))});
      }
    }
  }
  private boolean sameEvent(JSONObject stored, JSONObject queued) {
    return !stored.isNull("uid") && stored.optString("uid").equals(queued.optString("uid"))
      && stored.optString("type").equals(queued.optString("type")) && stored.optLong("t", -1) == queued.optLong("t", -2);
  }
}
