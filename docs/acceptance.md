# Acceptance record

The milestone requested by the user is **not complete** until a real Route phone passes the full eight-step flow against a separate staging Firebase project. A compiled APK and mocked browser data are evidence for individual steps only.

## First working milestone

| Step | Required observation | Current evidence |
| --- | --- | --- |
| 1 | Install Route APK | Debug APK built and installed on an Android 15 emulator; physical phone pending |
| 2 | Sign in and receive approved route | Staging officer account, route role and approved assignment created; phone sign-in pending |
| 3 | Press Start Duty | Emulator started the location foreground service using a synthetic local session; authenticated staging trial pending |
| 4 | GPS transmits repeatedly | Emulator captured successive injected GPS fixes into SQLite; staging transmission pending |
| 5 | Website shows moving officer without refresh | Monitor website deployed and live login page verified in Chromium; real Firebase stream pending |
| 6 | Screen locked, tracking continues | Emulator captured a new fix with screen asleep; physical phone lock trial pending |
| 7 | Airplane mode queues points and reconnect uploads in order | Emulator stored another fix in SQLite with airplane mode on; reconnect upload pending |
| 8 | Authorized Stop Duty stops tracking | Device credential/password gate and stop event implemented; device trial pending |

## M0–M24 roadmap

`Implemented` means code exists. `Passed` means the stated acceptance test was actually run. No later phase is declared passed from static inspection alone.

| Milestone | Current state | Remaining acceptance evidence |
| --- | --- | --- |
| M0 Original compatibility | Partial | Data contract and synthetic data documented; live legacy workflow comparison outstanding |
| M1 Project setup | Passed locally | APK builds, dashboard Playwright runs, FastAPI `/health` returns 200 |
| M2 Authentication and roles | Partial | Cloud rules deployed, accounts and roles created; real staging sign-in and denial tests pending |
| M3 Route registration and QR | Partial | QR scanner and approved assignment check built; phone enrollment test |
| M4 Duty management | Partial | Start, Stop, session ID built; pause and restart tests outstanding |
| M5 Continuous GPS | Partial | Successive emulator fixes, including a screen-asleep fix, stored; real phone and Firebase stream outstanding |
| M6 Offline tracking | Partial | Airplane-mode emulator fix stored in SQLite; reconnect upload order test outstanding |
| M7 Realtime map | Partial | Playwright mock passed and HTTPS site deployed; actual phone movement stream outstanding |
| M8 Device health | Partial | Battery, signal, GPS freshness shown; real stale/ended test outstanding |
| M9 Routes and arrival | Partial | Existing dashboard trails and off-route logic retained; field validation outstanding |
| M10 Operational view | Partial | Dashboard filters and wall view retained; operator trial outstanding |
| M11 SOS | Partial | SOS and queue built; server receipt and operator ack drill outstanding |
| M12 Dispatch | Partial | Operator dispatch UI retained; end-to-end response drill outstanding |
| M13 Messages and alerts | Partial | Route polling and website alerts built; receipt state test outstanding |
| M14 Media | Partial | Photo/voice paths built; real upload and authorized playback trial outstanding |
| M15 Polling location reports | Partial | Route report buttons built; correct site association test outstanding |
| M16 Turnout | Partial | Route vote event and dashboard totals retained; invalid/duplicate test outstanding |
| M17 Incidents | Partial | Dashboard incident flow retained; full audit trail trial outstanding |
| M18 History and replay | Partial | Dashboard playback retained; selected-unit scale test outstanding |
| M19 Excel, QR, reports | Partial | SheetJS and QR retained; import/export round-trip test outstanding |
| M20 Configuration | Partial | Admin settings retained; active-duty consistency trial outstanding |
| M21 Security and audit | Partial | Local rules emulator allow/deny suite passed; validation, audit and retention tests outstanding |
| M22 Performance and battery | Pending | Representative device and fleet load measurements |
| M23 Field testing | Pending | Real phones, lock, GPS loss, low battery, network loss, SOS drills |
| M24 Production release | Pending | Production keys, release signing, backup and operator procedures |

## Local test notes, 2026-11-02

- Android 15 Google APIs emulator: debug APK installed; foreground location service reported `isForeground=true`.
- Injected distinct coordinates, locked the emulator (`mWakefulness=Asleep`), and injected another coordinate. SQLite `pending` contained the original timestamps and changed coordinates.
- Enabled airplane mode, injected another fix, and confirmed the point remained in SQLite. This does **not** prove upload after reconnection.
- `npm test`: 2 Playwright dashboard tests passed with mock Firebase responses.
- `npm run test:rules`: local Firebase Realtime Database emulator test passed for authorized and denied reads/writes.
- `./gradlew :android-route:assembleDebug`: debug build succeeded.
- At the time of these initial local tests, no staging Firebase configuration or physical Android phone was available for the full eight-step flow.

## Staging configuration, 2026-11-02

- Received the `officer-8eb52` Firebase web config and the exact Realtime Database URL. The debug APK and single-file website now use those staging values by default.
- An unauthenticated read-only probe to a nonexistent path returned HTTP 401. This confirms anonymous access was denied for that request; it does not verify that this repository's complete rule set has been deployed.
- The rebuilt APK installed on the emulator and its UI showed the staging API key and database URL prefilled. Dashboard Playwright tests and local Realtime Database rules tests passed again.
- The officer/admin test UIDs and a real phone had not yet been supplied at that point. Authenticated streaming, offline upload after reconnection, and authorized Stop Duty against this Firebase project remained untested.

## Cloud setup, 2026-11-02

- Deployed `firebase/database.rules.json` to `officer-8eb52-default-rtdb`; readback exactly matched the source file. An anonymous request to `/live.json` returned HTTP 401.
- Verified the monitor Auth UID `ULes0f1Oxea5SuX6zFp6UxsffUm2` and assigned its `admin` role. Verified the new route Auth UID `0bvdsuoCL2Wk2myL7zI6BTqhge13`, assigned its `route` role, and saved the `Staging` / `Test police station` / `Test route 1` assignment. Readback confirmed both role and assignment.
- Deployed the single-file dashboard to `https://officer-8eb52.web.app`. HTTPS returned 200; the served file's SHA-256 matched `dist/index.html`. Headless Chromium showed the login form with staging config already selected.
- `npm test` passed both Playwright cases after the hosting build. A physical Android phone was still not connected; only `emulator-5554` appeared in `adb devices`. No authenticated Route-to-Monitor GPS transmission has yet been observed.
