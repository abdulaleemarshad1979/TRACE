# TRACK 2.2.3 release preparation

Monitor: https://officer-8eb52.web.app

The monitor and Android app use the same configured Firebase Realtime Database. Routes and polling coordinates are read after authentication; the public HTML and APK contain no embedded election deployment dataset.

## Sign-in and duty

### SI mandal monitor

An administrator opens **Settings → Routes → Create viewer login**, enters the officer's name, rank, mobile number, password and mandal, and selects the exact routes assigned to that mandal. Viewer rank choices are **Incharge, Striking Force, Sub-Striking Force, and DSP**. The route list is explicit because some mandals share a police station. The command control room issues the rank, mobile number and password to the officer. The officer selects **Viewer Login** on **https://officer-8eb52.web.app/** and signs in on the same page. The read-only monitor shows those routes, their assigned phones, live positions, connection status and open SOS alerts. An unassigned route appears without a phone.

**Manage viewer logins** lists existing accounts and lets an administrator edit the officer, rank, mobile number, password, mandal and routes. **Delete login** removes the Firebase Authentication sign-in and database access record, freeing the mobile number after verifying the viewer's current password. It no longer offers a separate access-only removal that could leave an invisible sign-in behind. If the sign-in deletion succeeds but the database update fails, **Retry cleanup** completes the database removal without repeating sign-in deletion. Changing the mobile number or password likewise requires the current password. The viewer map shows only polling booths linked by police station and route to the selected route IDs, and fits the view to both those booths and any phone positions. A connected phone without coordinates shows **Waiting for GPS fix** until the route app obtains a valid position. An existing account created before booth scoping should be opened with **Edit** and saved once to populate its booth list. Actual mandal boundary polygons are not part of the current deployment data; the map extent is derived from assigned polling booth and phone coordinates.

Routes and polling locations are stored in Firebase Realtime Database. Removing text from the code or rebuilding Hosting does not remove saved database records. The Settings route list and count follow the chosen election, sub-division and police station. **Remove shown routes** deletes only the listed routes. **Edit route → Remove** deletes one route. These route deletion actions, including **Delete election**, also clear linked route-member roles, assignments, current devices and live entries. Old assignments with no route member link are cleared when their saved route ID or police station and route matches a deleted route. **Correct polling location → Remove location** and **Remove all polling locations** delete polling location records. These actions require an administrator account. Deleting a route or polling location also removes it from viewer displays within five minutes, when the viewer next reloads its assignment, even if a viewer's older scope still lists its ID.

To remove a person while keeping the route, open **Settings → Routes → Assign member → Remove person**, review the confirmation, enter the person's current password if a member sign-in is linked, and choose **Yes, remove person**. This deletes the Firebase Authentication sign-in and the route assignment, current device and live entries, and clears the name and mobile from the route. An older assignment without a member link is recognized when its saved mobile and route match the officer being removed. An imported officer without a matching sign-in only has those saved name and mobile fields cleared. Removing an assigned phone in **Registered phones** leads to the same person confirmation. Historical tracking and reports remain as duty records. If sign-in deletion succeeds but the database update fails, **Retry cleanup** completes the database removal. Editing route details preserves its member link. Remove the person first if the police station or route number must change.
If an older removal left a route assignment without a route member link, the dashboard can reuse that account on a new route after verifying its current password, provided the phone is off duty. A member still linked to another route must first be removed from that route.

The `si_monitor` role and `siScopes/{uid}/routes` and `stations` are enforced in Realtime Database rules. The SI can read only selected route records, their assigned phone data, selected polling booths and per-phone SOS events; database writes and other mandals are denied. New mobile assignments save a `routeId`; creating the SI account also links matching existing mobile assignments to their route IDs. SI mobile logins use a separate internal Firebase email (`si91…@members.track.invalid`), so an SI number cannot take over a route member account. Deploy the Hosting build and database rules together before issuing SI credentials. The workbook personnel abstracts are not imported into this monitor because several source figures need correction.

1. Sign into the monitor as the control-room administrator, then open **Settings → Routes → Assign member** beside the chosen route.
2. Enter officer name/rank, a 10-digit Indian mobile number (or +91 format), and a password of at least 8 characters. For an existing mobile login, use its current password. This form does not reset passwords.
3. For a route marked **Review coverage**, inspect the displayed polling locations and confirm the coverage before assigning it.
4. Give that member the mobile number/password and the 2.2.3 APK. The member taps **Sign in and load my route**; only the assigned route is shown, with officer details filled automatically. Tap **Continue to duty**, grant precise location, turn GPS on and tap **START DUTY**.
5. One account identifies one phone. An account cannot be moved from another route or modified while on duty through this form. Administrator/monitor accounts are never demoted to route accounts.

Mobile logins use a normalized internal Firebase email identifier (`phone91…@members.track.invalid`), with Firebase Authentication handling passwords. The dashboard creates the member through the [Firebase Auth REST API](https://firebase.google.com/docs/reference/rest/auth), without replacing the administrator session. Roles, assignment, route member details and coverage review are saved together in one database update. Passwords are never stored in the Realtime Database. Existing administrator email logins remain supported. An account created before an interrupted database save can safely be retried using the same credentials.

Android 12 requires coarse and fine location permissions to be requested together; see [Android location permission guidance](https://developer.android.com/develop/sensors-and-location/location/permissions/runtime).

## Full map

**Open full map** on the Summary's Live Tracking card, or the **⛶ Full map** button on any map, shows only the map across the whole window. **Exit full map**, Esc or the browser's Back button returns to the earlier view. SOS alerts still appear over the map. The viewer portal has its own **Full map** button, which Esc or **Exit full map** closes.

## Imported workbooks

`tools/import-election.py --downloads DIR --output PRIVATE_DIR` requires openpyxl. It processes only the six named input files, expands merged cells, normalizes station names, and uses the Routes sheets. The East Zone copy takes precedence over the overlapping generic workbook. It produces `election-config.json` and `import-report.json` with source sheet/row references.

The initial import contained 178 routes and 706 location records. The user requested 152 routes based on the image and all six workbooks. The image's station counts add to 150; the North Zone workbook's abstract, Data and Routes sheets all support 7 Gokavaram routes instead of the image's 5, reconciling the total to 152.

An earlier local reconciliation produced 152 routes and 706 locations. Twenty-two routes contained **proposed** coverage changes to meet the requested station counts: closest-centroid consolidation of old route groups, and a latitude-ordered split for Chagallu's ninth route. These were explicitly labeled for operator review and are not claimed to be official boundaries. The live database had 151 routes and 621 locations on 3 November 2026. On 4 November it has 158 routes in `ZPTC/MPTC Elections 2026`, with no repeated police-station/route pair; 39 route rows have a linked member UID, and five older route assignments have no linked member UID. A member removal leaves the route itself in place, so it does not reduce the route total. The database has no route creation audit trail to establish who added the seven distinct routes since the earlier count. Do not replace the live catalog with the older import until the control room confirms which list is authoritative.

`tools/reconcile-routes.py` produces a proposed plan from private input and target-count JSON, preserving original route references on affected locations. A pre-change database backup and comparison workbook are kept locally. The review workbook is `Downloads/TRACK-152-Routes-Review.xlsx`. In the older 706-location import, seven locations lack individual source coordinates and seven are over 40 km from other locations in the same police station. The current 621-location database has two such outliers and no missing coordinates. The dashboard flags uncertain locations instead of putting them at possibly wrong positions. Private review lists are `.local-data/coordinate-verification.csv` and `.local-data/live-coordinate-verification.csv`.

Keep exports in `.local-data/` (gitignored), never in public hosting or the public GitHub repository. Database rules protect operational data; unauthenticated reads are denied.

## Peak election load

Plan for 152 Route apps sending GPS at the same time and about 190 signed-in phones and browser sessions in total. The Route app publishes one `live/{uid}` record every 30 seconds and a separate `track/{uid}` point for each new fix. At a steady 30-second GPS cadence, 152 phones generate about 10 database writes per second, before device registration, messages, events, retries and offline catch-up. The app queues offline points, coalesces live snapshots, and flushes at most six queued writes per heartbeat. The viewer pages refresh after the prior refresh completes and add a small random delay so simultaneous sign-ins do not keep polling in lockstep. Each refresh, about every 10 seconds, reads only the assigned phones' live positions. SOS checks run every 30 seconds, officer details every 5 minutes and the assignment with its booths every 5 minutes; a viewer tab in the background slows to once a minute.

The delay from a phone to the website is the phone's sending interval plus about 2 seconds: upload, a redraw at most every half second, and a 0.8-second marker slide. Route app 2.2.3 sends every 30 seconds, so that interval is the largest part. Control-room computers receive positions by live stream. If the stream fails three times in a row while online, a computer reads at short intervals for 30 minutes and then tries the stream again. Viewers read about every 10 seconds, which adds up to 12 seconds.

The current `officer-8eb52` Firebase project has billing disabled. [Firebase's Realtime Database limits](https://firebase.google.com/docs/database/usage/limits) give the Spark plan 100 simultaneous connections, while Blaze supports up to 200,000 per database. REST requests from the Route app and viewer are short-lived, so 190 signed-in people do not necessarily mean 190 persistent connections; this still cannot be treated as a capacity guarantee on Spark. Before field use at the stated peak, enable Blaze billing with budget alerts, pre-create the member and viewer accounts, and run a staged 152-phone/38-viewer rehearsal against the production configuration. Check Realtime Database connections, load, storage, outgoing bandwidth and permission errors in the [Firebase Usage dashboard](https://firebase.google.com/docs/database/usage/monitor-performance). [Firebase Authentication](https://firebase.google.com/docs/auth/limits) also limits account creation from one IP to 100 per hour, so create 190 accounts ahead of the election rather than during the simultaneous sign-in window. A real rehearsal is required to validate phone hardware, carrier networks, GPS conditions and end-to-end latency.

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
