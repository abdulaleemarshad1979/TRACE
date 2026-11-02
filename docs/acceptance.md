# Acceptance record

The milestone requested by the user is **not complete** until a real Route phone passes the full eight-step flow against a separate staging Firebase project. A compiled APK and mocked browser data are evidence for individual steps only.

## First working milestone

| Step | Required observation | Current evidence |
| --- | --- | --- |
| 1 | Install Route APK | Debug APK built and installed on an Android 15 emulator; physical phone pending |
| 2 | Sign in and receive approved route | Java flow and Firebase rules implemented; staging sign-in pending |
| 3 | Press Start Duty | Emulator started the location foreground service using a synthetic local session; authenticated staging trial pending |
| 4 | GPS transmits repeatedly | Emulator captured successive injected GPS fixes into SQLite; staging transmission pending |
| 5 | Website shows moving officer without refresh | Mocked Playwright live map passed; real Firebase stream pending |
| 6 | Screen locked, tracking continues | Emulator captured a new fix with screen asleep; physical phone lock trial pending |
| 7 | Airplane mode queues points and reconnect uploads in order | Emulator stored another fix in SQLite with airplane mode on; reconnect upload pending |
| 8 | Authorized Stop Duty stops tracking | Device credential/password gate and stop event implemented; device trial pending |

## M0–M24 roadmap

`Implemented` means code exists. `Passed` means the stated acceptance test was actually run. No later phase is declared passed from static inspection alone.

| Milestone | Current state | Remaining acceptance evidence |
| --- | --- | --- |
| M0 Original compatibility | Partial | Data contract and synthetic data documented; separate staging project needed |
| M1 Project setup | Passed locally | APK builds, dashboard Playwright runs, FastAPI `/health` returns 200 |
| M2 Authentication and roles | Partial | Firebase rules emulator allow/deny tests passed; real staging sign-in pending |
| M3 Route registration and QR | Partial | QR scanner and approved assignment check built; phone enrollment test |
| M4 Duty management | Partial | Start, Stop, session ID built; pause and restart tests outstanding |
| M5 Continuous GPS | Partial | Successive emulator fixes, including a screen-asleep fix, stored; real phone and Firebase stream outstanding |
| M6 Offline tracking | Partial | Airplane-mode emulator fix stored in SQLite; reconnect upload order test outstanding |
| M7 Realtime map | Partial | Playwright mock passed; actual phone movement stream outstanding |
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
- No staging Firebase credentials or physical Android phone were available for the full eight-step flow.
