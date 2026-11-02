# TRACK 2.1.0 deployment

Monitor: https://officer-8eb52.web.app

The monitor and Android app use the same configured Firebase Realtime Database. Routes and polling coordinates are read after authentication; the public HTML and APK contain no embedded election deployment dataset.

## Sign-in and duty

1. Use an existing Firebase Authentication email/password account. A Gmail address is accepted when registered in that project; this is not a Google OAuth sign-in.
2. The account must have `roles/{uid}` set to `route` or `admin`. A route account also needs `assignments/{uid}` with an exact `ps` and `route` from `config/routes`. An administrator can select any imported route.
3. Tap **Sign in and load my routes**, choose the station and route, enter the officer name, then continue. Registration must succeed before the duty screen opens.
4. Allow precise location, turn on GPS and tap **START DUTY**. The foreground notification remains visible while location sharing is active. The control-room map receives fixes through `live/{uid}` and history through `track/{uid}`.
5. Polling reports select real location IDs from the assigned route. A delivery message appears only after the server accepts a report. Failed uploads remain queued and are shown as needing a retry.

An account identifies one tracked phone. Do not share the same account across multiple phones. Existing route accounts with old test assignments must be assigned an actual route by the control-room administrator before duty.

Android 12 requires coarse and fine location permissions to be requested together; see [Android location permission guidance](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime).

## Imported workbooks

`tools/import-election.py --downloads DIR --output PRIVATE_DIR` requires openpyxl. It processes only the six named input files, expands merged cells, normalizes station names, and uses the Routes sheets. The East Zone copy takes precedence over the overlapping generic workbook. It produces `election-config.json` and `import-report.json` with source sheet/row references.

The import completed on 2 November 2026 contains 178 route assignments and 706 location records across 24 distinct police stations. The supplied image has 25 rows because Rajanagaram PS occurs under two mandals. These totals differ from the image's 152 routes and 698 locations. Seven locations lack usable coordinates, and Rajanagaram Route 9 has no usable location row. These are source-data issues requiring review before operational use. No coordinate was invented to fill a gap. The local review workbook lists every route, location and coordinate issue.

Keep exports in `.local-data/` (gitignored), never in public hosting or the public GitHub repository. Database rules protect operational data; unauthenticated reads are denied.

## Preparing an update

`version.json` is the single source for Android's `versionCode` and `versionName`. An update prompt appears only when the published version code is strictly greater than the installed one. Automatic checks are quiet on failure or equal/older releases. A manual failed check reports that it could not check; it does not claim the app is current. Choosing Later suppresses repeat automatic prompts for that version; manual checks still show it.

1. Increase `versionCode` and set `versionName`/release notes only for a release.
2. Build with the existing signing keystore: `./gradlew :android-route:testDebugUnitTest :android-route:assembleDebug :android-route:lintDebug`.
3. Copy the successful APK to `release/TRACK-Route-EastGodavari.apk`; update `sha256` in `version.json` to the file's SHA-256 digest.
4. Run `ANDROID_HOME=/path/to/sdk python3 tools/verify-release.py`.
5. Publish the APK and matching manifest in the same Git commit. Preserve the existing signing certificate so Android can upgrade installed copies. See [Android app signing](https://developer.android.com/studio/publish/app-signing.html).

CI builds/tests the source and verifies the published APK version, checksum and certificate. Its downloadable release artifact is the verified checked-in APK. Ordinary code edits do not announce an update until a matching APK release is prepared. CI never replaces the release with a randomly signed runner debug build.

## Verification completed

- Android build, two update-policy unit tests and Android lint passed.
- Four dashboard browser tests passed, including live telemetry/SOS and initial map fitting with grouped units and malformed fixes.
- Firebase role/ownership emulator tests passed.
- The APK signature matches the preceding distributed APK.
- Uploaded route/location JSON matches the database read-back exactly; anonymous route reads return HTTP 401.

No phone was attached during verification. Real-device installation, GPS acquisition, screen-off tracking, offline recovery and in-place upgrade still require a physical-device check. Automated checks cannot establish that an APK works on every device.
