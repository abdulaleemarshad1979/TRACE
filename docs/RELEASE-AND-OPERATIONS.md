# TRACK 2.2.2 release preparation

Monitor: https://officer-8eb52.web.app

The monitor and Android app use the same configured Firebase Realtime Database. Routes and polling coordinates are read after authentication; the public HTML and APK contain no embedded election deployment dataset.

## Sign-in and duty

### SI mandal monitor

An administrator opens **Settings → Routes → Create SI monitor**, enters the SI's name, mobile number, password and mandal, and selects the exact routes assigned to that mandal. The route list is explicit because some mandals share a police station. The command control room issues the mobile number and password to the SI. The SI uses the same dashboard sign-in URL and is sent to the read-only SI monitor. It shows those routes, their assigned phones, live positions, connection status and open SOS alerts. An unassigned route appears without a phone.

The `si_monitor` role and `siScopes/{uid}/routes` are enforced in Realtime Database rules. The SI can read only selected route records, their assigned phone data and per-phone SOS events; database writes and other mandals are denied. New mobile assignments save a `routeId`; creating the SI account also links matching existing mobile assignments to their route IDs. SI mobile logins use a separate internal Firebase email (`si91…@members.track.invalid`), so an SI number cannot take over a route member account. Deploy the Hosting build and database rules together before issuing SI credentials. The workbook personnel abstracts are not imported into this monitor because several source figures need correction.

1. Sign into the monitor as the control-room administrator, then open **Settings → Routes → Assign member** beside the chosen route.
2. Enter officer name/rank, a 10-digit Indian mobile number (or +91 format), and a password of at least 8 characters. For an existing mobile login, use its current password. This form does not reset passwords.
3. For a route marked **Review coverage**, inspect the displayed polling locations and confirm the coverage before assigning it.
4. Give that member the mobile number/password and the 2.2.2 APK. The member taps **Sign in and load my route**; only the assigned route is shown, with officer details filled automatically. Tap **Continue to duty**, grant precise location, turn GPS on and tap **START DUTY**.
5. One account identifies one phone. An account cannot be moved from another route or modified while on duty through this form. Administrator/monitor accounts are never demoted to route accounts.

Mobile logins use a normalized internal Firebase email identifier (`phone91…@members.track.invalid`), with Firebase Authentication handling passwords. The dashboard creates the member through the [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth), without replacing the administrator session. Roles, assignment, route member details and coverage review are saved together in one database update. Passwords are never stored in the Realtime Database. Existing administrator email logins remain supported. An account created before an interrupted database save can safely be retried using the same credentials.

Android 12 requires coarse and fine location permissions to be requested together; see [Android location permission guidance](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime).

## Imported workbooks

`tools/import-election.py --downloads DIR --output PRIVATE_DIR` requires openpyxl. It processes only the six named input files, expands merged cells, normalizes station names, and uses the Routes sheets. The East Zone copy takes precedence over the overlapping generic workbook. It produces `election-config.json` and `import-report.json` with source sheet/row references.

The initial import contained 178 routes and 706 location records. The user requested 152 routes based on the image and all six workbooks. The image's station counts add to 150; the North Zone workbook's abstract, Data and Routes sheets all support 7 Gokavaram routes instead of the image's 5, reconciling the total to 152.

An earlier local reconciliation produced 152 routes and 706 locations. Twenty-two routes contained **proposed** coverage changes to meet the requested station counts: closest-centroid consolidation of old route groups, and a latitude-ordered split for Chagallu's ninth route. These were explicitly labeled for operator review and are not claimed to be official boundaries. The current live database, checked on 3 November 2026, has 151 routes and 621 locations under a different election label and station IDs. Do not replace the live catalog with the older import until the control room confirms which list is authoritative.

`tools/reconcile-routes.py` produces a proposed plan from private input and target-count JSON, preserving original route references on affected locations. A pre-change database backup and comparison workbook are kept locally. The review workbook is `Downloads/TRACK-152-Routes-Review.xlsx`. In the older 706-location import, seven locations lack individual source coordinates and seven are over 40 km from other locations in the same police station. The current 621-location database has two such outliers and no missing coordinates. The dashboard flags uncertain locations instead of putting them at possibly wrong positions. Private review lists are `.local-data/coordinate-verification.csv` and `.local-data/live-coordinate-verification.csv`.

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

- Android build, update-policy and mobile-login normalization unit tests, and Android lint passed.
- Dashboard browser checks cover all eight tabs at five widths, mobile account provisioning, assignment restrictions, coverage review, live telemetry/SOS and initial map fitting.
- Firebase role/ownership emulator tests passed.
- The APK signature matches the preceding distributed APK.
- Uploaded route/location JSON matches the database read-back exactly; anonymous route reads return HTTP 401.

No phone was attached during verification. Real-device installation, GPS acquisition, screen-off tracking, offline recovery and in-place upgrade still require a physical-device check. Automated checks cannot establish that an APK works on every device.
