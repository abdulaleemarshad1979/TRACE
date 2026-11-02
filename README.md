# TRACK — East Godavari District Police
_(Tactical Route Alert & Coordination Kit)_

TRACK is an emergency response, patrol tracking, and election duty monitoring system tailored specifically for the **East Godavari District Police** (covering 29 Police Stations across Rajahmundry Urban, Rajahmundry Rural, Kovvur, and Mandapeta sub-divisions).

---

## Key Highlights

- 📱 **TRACK Route (Android Native Java)**:
  - **No Manual Connectivity Setup**: Raw API keys, database URLs, and passwords are removed from the field officer UI. Everything is securely pre-routed from the backend.
  - **4-Page Navigation Interface (No Endless Scrolling)**:
    1. **DUTY**: Police Station selection dropdown (29 East Godavari PSs), Route name, Officer details, and prominent START / STOP DUTY controls.
    2. **SOS & ALERTS**: Massive red emergency SOS trigger with immediate vibration/feedback, plus quick situation reports (`Normal`, `Tension`, `Problem`, `Reached Spot`).
    3. **POLLING**: Polling station selection, hourly votes polled turnout submission, and field observations.
    4. **COMMS & MEDIA**: High-resolution incident photo capture, push-to-talk voice dispatch, audio message playback, and HQ instruction feed.
  - **Reliable Background Tracking**: Android Foreground Service (`TrackService`) maintaining continuous GPS fixes even when phone is locked or app is minimized.
  - **Offline SQLite Outbox**: Automatically queues GPS fixes, SOS alerts, and reports when signal drops and flushes in chronological order upon reconnection.

- 🖥 **TRACK Monitor & Dashboard**:
  - High-performance Leaflet-based command map centered on East Godavari (`[17.0005, 81.8040]`, Rajamahendravaram).
  - Real-time unit markers, movement trails, speed/battery telemetry, active SOS visual pulses, and turnout matrix.
  - Operates standalone via Python or with Google Firebase Realtime Database.

- ⚡ **TRACK Python Backend (FastAPI)**:
  - Ultra-fast, lightweight asynchronous service.
  - Serves dynamic mobile & dashboard configuration (`/api/config`), canonical 29 Police Stations catalog (`/api/police-stations`).
  - High-throughput telemetry ingestion (`/api/telemetry`), priority SOS handling (`/api/sos`).
  - Real-time WebSocket feed (`/ws/live`) for sub-second control room updates.
  - Turnout aggregation and instant CSV/Excel export (`/api/reports/export.csv`).

---

## East Godavari Police Stations Directory (29 Stations)

| # | Police Station Name | Sub-Division | Default Lat / Lng |
|---|---|---|---|
| 1 | I Town L&O PS | Rajahmundry Urban | 17.0051, 81.7778 |
| 2 | II Town L&O PS | Rajahmundry Urban | 16.9924, 81.7821 |
| 3 | III Town L&O PS | Rajahmundry Urban | 17.0142, 81.7915 |
| 4 | Prakash Nagar PS | Rajahmundry Urban | 17.0215, 81.7850 |
| 5 | Bommuru PS | Rajahmundry Urban | 16.9785, 81.8152 |
| 6 | Rajanagaram PS | Rajahmundry Rural | 17.0850, 81.9012 |
| 7 | Kadiyam PS | Rajahmundry Rural | 16.9150, 81.8420 |
| 8 | Dowleswaram PS | Rajahmundry Rural | 16.9421, 81.7745 |
| 9 | Korukonda PS | Rajahmundry Rural | 17.1720, 81.8210 |
| 10 | Gokavaram PS | Rajahmundry Rural | 17.2415, 81.8820 |
| 11 | Seetha Nagaram PS | Rajahmundry Rural | 17.2012, 81.7015 |
| 12 | Anaparthi PS | Mandapeta Sub-division | 16.9950, 81.9540 |
| 13 | Biccavolu PS | Mandapeta Sub-division | 17.0210, 82.0450 |
| 14 | Rangampeta PS | Mandapeta Sub-division | 17.0512, 81.9820 |
| 15 | Kovvuru town PS | Kovvur Sub-division | 17.0125, 81.7280 |
| 16 | Kovvuru rural PS | Kovvur Sub-division | 17.0250, 81.7150 |
| 17 | Chagallu PS | Kovvur Sub-division | 16.9720, 81.6520 |
| 18 | Thallapudi PS | Kovvur Sub-division | 17.0950, 81.6810 |
| 19 | Gopalapuram PS | Kovvur Sub-division | 17.1120, 81.5420 |
| 20 | Devarapalli PS | Kovvur Sub-division | 17.0320, 81.5710 |
| 21 | Nidadavolu PS | Kovvur Sub-division | 16.9120, 81.6710 |
| 22 | Samisragudem PS | Kovvur Sub-division | 16.9450, 81.6420 |
| 23 | Undrajavaram PS | Kovvur Sub-division | 16.8520, 81.7120 |
| 24 | Peravali ps | Kovvur Sub-division | 16.7820, 81.7450 |
| 25 | Nallajarla PS | Kovvur Sub-division | 16.9520, 81.4820 |
| 26 | Mandapeta town | Mandapeta Sub-division | 16.8650, 81.9320 |
| 27 | mandapeta rural | Mandapeta Sub-division | 16.8780, 81.9150 |
| 28 | Angara | Mandapeta Sub-division | 16.8210, 81.9850 |
| 29 | Rayavaram | Mandapeta Sub-division | 16.8920, 82.0210 |

---

## Quickstart

### 1. Launch Fast Python Backend & Dashboard
```bash
# Start FastAPI service on port 8000
python3 -m uvicorn python.main:app --host 0.0.0.0 --port 8000
```
- Open `http://localhost:8000/` or `http://localhost:8000/dashboard` to access the live TRACK control room.
- View interactive Swagger API documentation at `http://localhost:8000/docs`.

### 2. Build Dashboard
```bash
node tools/build-dashboard.mjs
```
Generates `dashboard/TRACK.html` and `dist/index.html`.

### 3. Build Android App (TRACK Route)
```bash
./gradlew :android-route:assembleDebug
```
Output: `android-route/build/outputs/apk/debug/android-route-debug.apk`.
