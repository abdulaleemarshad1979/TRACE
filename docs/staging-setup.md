# Set up a separate TRACE staging project

This project is for the eight-step live-tracking trial. The staging project is `officer-8eb52`, separate from the Firebase project in the supplied original dashboard. Its Realtime Database rules are deployed and the Monitor website is live at **https://officer-8eb52.web.app**.

## Ready for the phone trial

- Monitor test account: `abdulaleemarshadm@gmail.com` (Firebase role `admin`). Sign in at the website with its existing password.
- Route test account: `admin@gmail.com` (UID `0bvdsuoCL2Wk2myL7zI6BTqhge13`, Firebase role `route`). Sign in on the phone with the password used when creating this account.
- Approved Route assignment: `Staging` / `Test police station` / `Test route 1` / `Test officer` / `test device`.
- The APK and website have the staging Firebase URL and API key prefilled. Keep account passwords private.

Install `android-route/build/outputs/apk/debug/android-route-debug.apk` on a real Android phone with Google Play services. Grant **precise location** and notifications. Sign in to the Route app as `admin@gmail.com`; leave the route fields empty before sign-in so the approved assignment can load. Open the Monitor site on a second screen and sign in as `abdulaleemarshadm@gmail.com`.

With the Route app visible, press **Start Duty** and walk outdoors. Confirm the site shows two or more changing locations without a refresh. Lock the phone and walk again; the persistent tracking notification should remain. Turn on airplane mode, move, then unlock the phone and check that the queued count rises. Turn connectivity back on and verify the queued points reach the site in timestamp order. End Duty through the app's credential prompt and verify further movement creates no new points. Record actual observations in `docs/acceptance.md`.

To let the development machine record logs, enable Developer options and USB debugging on the phone, connect USB, accept its debugging prompt, and run `adb devices`. A physical serial with status `device` is needed. Only an emulator was connected when the cloud setup was completed.

## Recreate staging in another project

1. Open [Firebase Console](https://console.firebase.google.com/) and select **Add project**. Give it a name such as `trace-staging`. Complete the project wizard.
2. Open **Build → Realtime Database → Create database**, choose a region, then create it. In its **Rules** tab, paste the contents of `firebase/database.rules.json` and publish. These rules deny anonymous reads and writes.
3. Open **Build → Authentication → Sign-in method** and enable **Email/Password**. In **Users**, add an administrator test account and an officer test account. Copy each account's **User UID** from the Users table. Keep passwords private.
4. Open **Project settings → General → Your apps → Add app → Web**. Register a staging web app. From its Firebase config snippet, copy `apiKey` and `databaseURL`. If `databaseURL` is absent, copy the exact URL at the top of **Realtime Database → Data**. The supplied `officer-8eb52` config and exact database URL are already recorded in `config/staging.json` and built into the current debug APK and website.
5. In **Realtime Database → Data**, add the following paths using the real UIDs. The Console can bootstrap the first admin role because it has project-owner access:

   ```text
   roles/<admin UID> = "admin"
   roles/<officer UID> = "route"
   assignments/<officer UID>/sd = "Test division"
   assignments/<officer UID>/ps = "Test police station"
   assignments/<officer UID>/route = "Test route 1"
   assignments/<officer UID>/officer = "Test officer"
   assignments/<officer UID>/mobile = "test device"
   ```

6. Open the hosted site or `dashboard/TRACE.html` and sign in with the admin test account. Install `android-route/build/outputs/apk/debug/android-route-debug.apk` on the test phone and sign in with the officer test account. The project settings are prefilled; verify the approved route appears. If the website had previously saved another Firebase project, use **Change project** and paste the staging config including `databaseURL`.
7. On the phone, enable Developer options and USB debugging, connect USB, accept the phone's debugging prompt, and run `adb devices`. It should show a device serial with status `device`. The real-phone test is required for the milestone acceptance record.

The staging accounts, roles, assignment, deployed rules, and website are ready. A signed-in phone and real movement are still needed to verify continuous tracking, offline upload, and Stop Duty. Do not send a service-account JSON file or passwords in chat.
