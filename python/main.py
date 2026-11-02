"""TRACK Operations & Dispatch API — East Godavari District Police.

Fast, lightweight FastAPI backend providing:
- Pre-configured client routing (zero client-side manual credentials)
- 29 East Godavari Police Stations catalog
- Real-time telemetry ingestion and WebSocket/SSE broadcast
- SOS emergency alerting and situation reporting
- Turnout aggregation and instant Excel/CSV report exports
- Embedded TRACK Web Dashboard hosting
"""
import io
import json
import os
import sqlite3
import time
from typing import Annotated, Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Canonical 29 Police Stations in East Godavari District
EAST_GODAVARI_POLICE_STATIONS = [
    {"id": "PS-01", "name": "I Town L&O PS", "sub_division": "Rajahmundry Urban", "lat": 17.0051, "lng": 81.7778},
    {"id": "PS-02", "name": "II Town L&O PS", "sub_division": "Rajahmundry Urban", "lat": 16.9924, "lng": 81.7821},
    {"id": "PS-03", "name": "III Town L&O PS", "sub_division": "Rajahmundry Urban", "lat": 17.0142, "lng": 81.7915},
    {"id": "PS-04", "name": "Prakash Nagar PS", "sub_division": "Rajahmundry Urban", "lat": 17.0215, "lng": 81.7850},
    {"id": "PS-05", "name": "Bommuru PS", "sub_division": "Rajahmundry Urban", "lat": 16.9785, "lng": 81.8152},
    {"id": "PS-06", "name": "Rajanagaram PS", "sub_division": "Rajahmundry Rural", "lat": 17.0850, "lng": 81.9012},
    {"id": "PS-07", "name": "Kadiyam PS", "sub_division": "Rajahmundry Rural", "lat": 16.9150, "lng": 81.8420},
    {"id": "PS-08", "name": "Dowleswaram PS", "sub_division": "Rajahmundry Rural", "lat": 16.9421, "lng": 81.7745},
    {"id": "PS-09", "name": "Korukonda PS", "sub_division": "Rajahmundry Rural", "lat": 17.1720, "lng": 81.8210},
    {"id": "PS-10", "name": "Gokavaram PS", "sub_division": "Rajahmundry Rural", "lat": 17.2415, "lng": 81.8820},
    {"id": "PS-11", "name": "Seetha Nagaram PS", "sub_division": "Rajahmundry Rural", "lat": 17.2012, "lng": 81.7015},
    {"id": "PS-12", "name": "Anaparthi PS", "sub_division": "Mandapeta Sub-division", "lat": 16.9950, "lng": 81.9540},
    {"id": "PS-13", "name": "Biccavolu PS", "sub_division": "Mandapeta Sub-division", "lat": 17.0210, "lng": 82.0450},
    {"id": "PS-14", "name": "Rangampeta PS", "sub_division": "Mandapeta Sub-division", "lat": 17.0512, "lng": 81.9820},
    {"id": "PS-15", "name": "Kovvuru town PS", "sub_division": "Kovvur Sub-division", "lat": 17.0125, "lng": 81.7280},
    {"id": "PS-16", "name": "Kovvuru rural PS", "sub_division": "Kovvur Sub-division", "lat": 17.0250, "lng": 81.7150},
    {"id": "PS-17", "name": "Chagallu PS", "sub_division": "Kovvur Sub-division", "lat": 16.9720, "lng": 81.6520},
    {"id": "PS-18", "name": "Thallapudi PS", "sub_division": "Kovvur Sub-division", "lat": 17.0950, "lng": 81.6810},
    {"id": "PS-19", "name": "Gopalapuram PS", "sub_division": "Kovvur Sub-division", "lat": 17.1120, "lng": 81.5420},
    {"id": "PS-20", "name": "Devarapalli PS", "sub_division": "Kovvur Sub-division", "lat": 17.0320, "lng": 81.5710},
    {"id": "PS-21", "name": "Nidadavolu PS", "sub_division": "Kovvur Sub-division", "lat": 16.9120, "lng": 81.6710},
    {"id": "PS-22", "name": "Samisragudem PS", "sub_division": "Kovvur Sub-division", "lat": 16.9450, "lng": 81.6420},
    {"id": "PS-23", "name": "Undrajavaram PS", "sub_division": "Kovvur Sub-division", "lat": 16.8520, "lng": 81.7120},
    {"id": "PS-24", "name": "Peravali PS", "sub_division": "Kovvur Sub-division", "lat": 16.7820, "lng": 81.7450},
    {"id": "PS-25", "name": "Nallajarla PS", "sub_division": "Kovvur Sub-division", "lat": 16.9520, "lng": 81.4820},
    {"id": "PS-26", "name": "Mandapeta town PS", "sub_division": "Mandapeta Sub-division", "lat": 16.8650, "lng": 81.9320},
    {"id": "PS-27", "name": "Mandapeta rural PS", "sub_division": "Mandapeta Sub-division", "lat": 16.8780, "lng": 81.9150},
    {"id": "PS-28", "name": "Angara PS", "sub_division": "Mandapeta Sub-division", "lat": 16.8210, "lng": 81.9850},
    {"id": "PS-29", "name": "Rayavaram PS", "sub_division": "Mandapeta Sub-division", "lat": 16.8920, "lng": 82.0210},
]

# Database setup (SQLite for lightweight standalone operation)
DB_PATH = os.environ.get("TRACK_DB_PATH", "track_operations.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            officer TEXT,
            mobile TEXT,
            ps TEXT,
            route TEXT,
            lat REAL,
            lng REAL,
            spd REAL,
            hdg REAL,
            acc REAL,
            bat REAL,
            sig INTEGER,
            duty INTEGER,
            t INTEGER NOT NULL
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            uid TEXT NOT NULL,
            ps TEXT,
            route TEXT,
            status TEXT,
            note TEXT,
            votes INTEGER,
            lat REAL,
            lng REAL,
            t INTEGER NOT NULL
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_uid_t ON telemetry(uid, t)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_events_type_t ON events(type, t)")
    conn.commit()
    conn.close()

init_db()

app = FastAPI(
    title="TRACK Operations & Dispatch API - East Godavari District Police",
    description="High-performance backend for live patrol tracking, emergency SOS, and field coordination.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory fast cache for live fleet & active alerts
LIVE_FLEET: Dict[str, dict] = {}
ACTIVE_ALERTS: List[dict] = []
WS_CLIENTS: List[WebSocket] = []

# Models
class TelemetryFix(BaseModel):
    uid: str
    officer: Optional[str] = "Duty Officer"
    mobile: Optional[str] = ""
    ps: str
    route: Optional[str] = "Patrol Route"
    lat: float
    lng: float
    spd: Optional[float] = 0.0
    hdg: Optional[float] = 0.0
    acc: Optional[float] = 0.0
    bat: Optional[float] = 100.0
    sig: Optional[int] = 4
    duty: Optional[bool] = True
    t: Optional[int] = None

class EventReport(BaseModel):
    id: Optional[str] = None
    type: str  # "sos", "loc", "votes", "reached", "photo", "msg"
    uid: str
    ps: Optional[str] = ""
    route: Optional[str] = ""
    status: Optional[str] = ""  # "normal", "tension", "problem"
    note: Optional[str] = ""
    votes: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    t: Optional[int] = None

@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": "TRACK Operations & Dispatch API",
        "district": "East Godavari District Police",
        "police_stations_count": len(EAST_GODAVARI_POLICE_STATIONS),
        "live_units_online": len(LIVE_FLEET),
        "timestamp": int(time.time() * 1000)
    }

@app.get("/api/config")
def get_config():
    """Return backend pre-configured routing and district metadata."""
    staging_file = os.path.join(os.path.dirname(__file__), "..", "config", "staging.json")
    firebase_cfg = {}
    if os.path.exists(staging_file):
        try:
            with open(staging_file, "r") as f:
                firebase_cfg = json.load(f)
        except Exception:
            pass

    return {
        "app_name": "TRACK",
        "district": "East Godavari District",
        "districtName": "East Godavari District Police",
        "headquarters": "Rajamahendravaram",
        "center": [17.0005, 81.8040],
        "coordinates": [17.0005, 81.8040],
        "map_center": {"lat": 17.0005, "lng": 81.8040, "zoom": 11},
        "zoom": 11,
        "apiKey": firebase_cfg.get("apiKey", ""),
        "databaseURL": firebase_cfg.get("databaseURL", ""),
        "projectId": firebase_cfg.get("projectId", ""),
        "authDomain": firebase_cfg.get("authDomain", ""),
        "storageBucket": firebase_cfg.get("storageBucket", ""),
        "messagingSenderId": firebase_cfg.get("messagingSenderId", ""),
        "appId": firebase_cfg.get("appId", ""),
        "firebase": firebase_cfg,
        "totalPoliceStations": len(EAST_GODAVARI_POLICE_STATIONS),
        "police_stations": EAST_GODAVARI_POLICE_STATIONS,
        "polling_interval_ms": 8000
    }

@app.get("/api/police-stations")
def get_police_stations():
    """Return canonical list of 29 East Godavari Police Stations."""
    return {
        "district": "East Godavari",
        "total": len(EAST_GODAVARI_POLICE_STATIONS),
        "stations": EAST_GODAVARI_POLICE_STATIONS
    }

@app.get("/api/app/version")
def get_app_version():
    """Return latest TRACK Route Android APK version metadata."""
    v_path = os.path.join(os.path.dirname(__file__), "..", "version.json")
    if os.path.exists(v_path):
        try:
            with open(v_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "versionCode": 2,
        "versionName": "2.0.0",
        "appName": "TRACK Route",
        "district": "East Godavari District Police",
        "apkUrl": "https://raw.githubusercontent.com/abdulaleemarshad1979/TRACE/main/release/TRACK-Route-EastGodavari.apk",
        "releaseNotes": "TRACK East Godavari District Police v2.0"
    }

@app.get("/api/app/download")
def download_apk():
    """Download the latest TRACK Route Android APK."""
    apk_path = os.path.join(os.path.dirname(__file__), "..", "release", "TRACK-Route-EastGodavari.apk")
    if os.path.exists(apk_path):
        return FileResponse(apk_path, media_type="application/vnd.android.package-archive", filename="TRACK-Route-EastGodavari.apk")
    raise HTTPException(404, "APK not found in release directory")


@app.post("/api/telemetry")
async def ingest_telemetry(fix: TelemetryFix):
    """Ingest single or continuous GPS telemetry fix from mobile unit."""
    now = fix.t or int(time.time() * 1000)
    payload = fix.dict()
    payload["t"] = now
    payload["up"] = int(time.time() * 1000)

    # Update in-memory fast cache
    LIVE_FLEET[fix.uid] = payload

    # Persist asynchronously into SQLite
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            INSERT INTO telemetry (uid, officer, mobile, ps, route, lat, lng, spd, hdg, acc, bat, sig, duty, t)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (fix.uid, fix.officer, fix.mobile, fix.ps, fix.route, fix.lat, fix.lng, fix.spd, fix.hdg, fix.acc, fix.bat, fix.sig, 1 if fix.duty else 0, now))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error persisting telemetry: {e}")

    # Broadcast to all live WebSocket control room screens
    await broadcast_ws({"type": "telemetry", "data": payload})
    return {"status": "ok", "delivered": True}

@app.post("/api/sos")
async def trigger_sos(event: EventReport):
    """Priority emergency SOS trigger endpoint."""
    event.type = "sos"
    return await log_event(event)

@app.post("/api/events")
async def log_event(event: EventReport):
    """Ingest emergency alerts, situation reports, or turnout counts."""
    now = event.t or int(time.time() * 1000)
    evt_id = event.id or f"evt_{int(now)}_{event.uid[:6]}"
    payload = event.dict()
    payload["id"] = evt_id
    payload["t"] = now

    if event.type == "sos" or event.status in ("tension", "problem"):
        ACTIVE_ALERTS.insert(0, payload)
        if len(ACTIVE_ALERTS) > 200:
            ACTIVE_ALERTS.pop()

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            INSERT OR REPLACE INTO events (id, type, uid, ps, route, status, note, votes, lat, lng, t)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (evt_id, event.type, event.uid, event.ps, event.route, event.status, event.note, event.votes, event.lat, event.lng, now))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error persisting event: {e}")

    # Broadcast immediate alert to control room
    await broadcast_ws({"type": "event", "data": payload})
    return {"status": "ok", "id": evt_id, "delivered": True}

@app.get("/api/fleet")
@app.get("/fleet")
def get_fleet():
    """Return all currently active units with latest GPS and battery."""
    now = int(time.time() * 1000)
    units = []
    for uid, data in LIVE_FLEET.items():
        is_online = (now - data.get("up", 0)) < (3 * 60 * 1000)
        units.append({**data, "online": is_online})
    return {"total": len(units), "units": units, "vehicles": units}

@app.get("/api/alerts")
@app.get("/alerts")
def get_alerts():
    """Return active emergency SOS and critical situation alerts."""
    return {"total": len(ACTIVE_ALERTS), "alerts": ACTIVE_ALERTS[:50]}

@app.get("/api/reports/turnout")
def get_turnout_summary():
    """Aggregated votes polled and turnout across all 29 East Godavari PSs."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        SELECT ps, MAX(votes), MAX(t) FROM events
        WHERE type = 'votes' AND ps != ''
        GROUP BY ps
    """)
    rows = c.fetchall()
    conn.close()

    ps_votes = {row[0]: {"votes": row[1], "last_update": row[2]} for row in rows}
    total_votes = sum(item["votes"] for item in ps_votes.values() if item["votes"])

    summary = []
    for ps in EAST_GODAVARI_POLICE_STATIONS:
        name = ps["name"]
        data = ps_votes.get(name, {"votes": 0, "last_update": None})
        summary.append({
            "ps": name,
            "sub_division": ps["sub_division"],
            "votes_polled": data["votes"] or 0,
            "last_update": data["last_update"]
        })

    return {
        "district": "East Godavari",
        "total_votes_polled": total_votes,
        "reporting_stations": len(ps_votes),
        "total_stations": len(EAST_GODAVARI_POLICE_STATIONS),
        "data": summary
    }

@app.get("/api/reports/turnout/export")
@app.get("/api/reports/turnout/export.csv")
@app.get("/api/reports/export.csv")
def export_turnout_csv():
    """Instant CSV download for operational command turnout report."""
    summary = get_turnout_summary()
    output = io.StringIO()
    output.write("S.NO,POLICE STATION,SUB-DIVISION,VOTES POLLED,LAST UPDATE\n")
    for idx, item in enumerate(summary["data"], 1):
        t_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(item['last_update'] / 1000)) if item['last_update'] else "N/A"
        output.write(f"{idx},\"{item['ps']}\",\"{item['sub_division']}\",{item['votes_polled']},\"{t_str}\"\n")
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=East_Godavari_TRACK_Turnout.csv"}
    )

# Realtime WebSocket stream for Control Room
@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    WS_CLIENTS.append(websocket)
    try:
        # Send initial snapshot
        await websocket.send_json({
            "type": "init",
            "fleet": list(LIVE_FLEET.values()),
            "alerts": ACTIVE_ALERTS[:20],
            "stations": EAST_GODAVARI_POLICE_STATIONS
        })
        while True:
            # Keepalive / ping
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in WS_CLIENTS:
            WS_CLIENTS.remove(websocket)
    except Exception:
        if websocket in WS_CLIENTS:
            WS_CLIENTS.remove(websocket)

async def broadcast_ws(message: dict):
    for client in list(WS_CLIENTS):
        try:
            await client.send_json(message)
        except Exception:
            if client in WS_CLIENTS:
                WS_CLIENTS.remove(client)

# Mount Dashboard
dashboard_path = os.path.join(os.path.dirname(__file__), "..", "dist")
if os.path.exists(dashboard_path):
    app.mount("/dashboard", StaticFiles(directory=dashboard_path, html=True), name="dashboard")

@app.get("/", response_class=HTMLResponse)
def root():
    dist_index = os.path.join(dashboard_path, "index.html")
    if os.path.exists(dist_index):
        with open(dist_index, "r") as f:
            return f.read()
    return """
    <html>
        <head><title>TRACK — East Godavari District Police</title></head>
        <body style="font-family:sans-serif;background:#0d1117;color:#fff;padding:40px;">
            <h1>TRACK — East Godavari District Police</h1>
            <p>Operations & Dispatch API Active.</p>
            <ul>
                <li><a style="color:#58a6ff" href="/api/config">/api/config</a></li>
                <li><a style="color:#58a6ff" href="/api/police-stations">/api/police-stations (29 Stations)</a></li>
                <li><a style="color:#58a6ff" href="/api/fleet">/api/fleet</a></li>
                <li><a style="color:#58a6ff" href="/api/alerts">/api/alerts</a></li>
                <li><a style="color:#58a6ff" href="/api/reports/turnout">/api/reports/turnout</a></li>
                <li><a style="color:#58a6ff" href="/api/reports/export.csv">Download Turnout CSV</a></li>
            </ul>
        </body>
    </html>
    """
