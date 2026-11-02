# TRACE

TRACE Monitor is a **single HTML website**. TRACE Route is a **native Java Android app** with a location foreground service. The dashboard is built from the supplied TRACE HTML so its map, incidents, alerts, reports, Excel, QR and messaging workflows remain available. A separate FastAPI service provides authenticated fleet, alert and summary endpoints plus route assignment; the website and phone use Firebase Realtime Database directly for live synchronization.

## Build and run locally

```sh
npm ci
npm test                         # builds single-file dashboard, runs headless Chromium
npm run test:rules               # local Firebase Realtime Database rules emulator
ANDROID_HOME=/path/to/android-sdk ./gradlew :android-route:assembleDebug
python -m venv .venv
.venv/bin/pip install -r python/requirements.txt
.venv/bin/uvicorn python.main:app --port 8000
```

Open `dashboard/TRACE.html` in Chrome, or host that one file over HTTPS. The installable debug APK is `android-route/build/outputs/apk/debug/android-route-debug.apk`. The Android build needs API 35 and Google Play services on the test phone for Fused Location Provider. The dashboard needs network access for Firebase and map tiles, but no custom web server.

`GET http://localhost:8000/health` returns 200 even before Firebase is configured; protected API endpoints return 503 until configuration is supplied.

## Create a separate staging Firebase project

1. In [Firebase Console](https://console.firebase.google.com/), create a **new project for testing**. Do not reuse the project embedded in the supplied old dashboard.
2. Add a **Web app** in Project settings → Your apps. Copy its `apiKey` and `databaseURL`. If the config lacks `databaseURL`, create a Realtime Database first and then copy its URL from the Data tab.
3. Enable Authentication → Sign-in method → **Email/Password**. Create one admin and one Route test user in Authentication → Users, then copy both UIDs. Do not share account passwords in chat.
4. Create a Realtime Database in your chosen region. Install `firebase/database.rules.json` under Realtime Database → Rules. The rules deny anonymous access.
5. In the Database **Data** tab, bootstrap `roles/{admin UID} = "admin"`. Add `assignments/{route UID}` with `sd`, `ps`, `route`, `officer`, `mobile`, and set `roles/{route UID} = "route"`. The admin can also use authenticated `PUT /assignments/{uid}` in FastAPI after its credentials are configured.
6. Open the website and paste the Web app config, then sign in as the admin. On the Route phone, enter the same staging API key and database URL, sign in as the Route test user, and scan or enter the approved route. The QR contains route information only; a matching server assignment and Route account are still required.

To run FastAPI with staging data, set `TRACE_DATABASE_URL` and `GOOGLE_APPLICATION_CREDENTIALS` to a **server-side** service account JSON path. Never place that JSON in the website or APK. For a separate browser dashboard and phone, the FastAPI service is optional for location streaming.

## First live-tracking test

Install the debug APK on an Android phone with Google Play services. Grant precise location and notifications. Sign in, press **START DUTY** while the app is visible, then move outdoors. Confirm at least two changing coordinates on the website with no manual refresh. Lock the screen and repeat. Switch to airplane mode, move again, and check the Route screen's queued count after unlocking. Restore the connection and verify the stored points appear in time order on the website. End Duty through the device credential or account-password prompt, and verify no new fixes are transmitted. Record the result in `docs/acceptance.md`.

An Android force-stop or revoked location permission can stop tracking. Browser notifications require the website to remain open and notification permission; for background website push with the page closed, a hosted service worker and web push setup are additional work.

See `docs/data-contract.md` for the RTDB shapes and `docs/acceptance.md` for M0–M24 status. The original APKs were binary references; this is a new source implementation, not recovered original Java source.
