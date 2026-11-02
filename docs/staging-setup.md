# Set up a separate TRACE staging project

This project is for the eight-step live-tracking trial. Keep it separate from the Firebase project in the supplied original dashboard.

1. Open [Firebase Console](https://console.firebase.google.com/) and select **Add project**. Give it a name such as `trace-staging`. Complete the project wizard.
2. Open **Build → Realtime Database → Create database**, choose a region, then create it. In its **Rules** tab, paste the contents of `firebase/database.rules.json` and publish. These rules deny anonymous reads and writes.
3. Open **Build → Authentication → Sign-in method** and enable **Email/Password**. In **Users**, add an administrator test account and an officer test account. Copy each account's **User UID** from the Users table. Keep passwords private.
4. Open **Project settings → General → Your apps → Add app → Web**. Register a staging web app. From its Firebase config snippet, copy `apiKey` and `databaseURL`. If `databaseURL` is absent, copy the exact URL at the top of **Realtime Database → Data**. The URL is normally `https://<name>-default-rtdb.<region>.firebasedatabase.app` or an older `firebaseio.com` URL.
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

6. Open `dashboard/TRACE.html`, paste the staging web config, and sign in with the admin test account. Install `android-route/build/outputs/apk/debug/android-route-debug.apk` on the test phone. Enter the staging `apiKey` and `databaseURL` in the Route app, sign in with the officer test account, and verify the approved route appears.
7. On the phone, enable Developer options and USB debugging, connect USB, accept the phone's debugging prompt, and run `adb devices`. It should show a device serial with status `device`. The real-phone test is required for the milestone acceptance record.

For me to run the connected end-to-end trial, provide only the **staging** `apiKey`, `databaseURL`, test officer UID/email, and test admin UID/email. You can enter passwords directly on the phone and website. Do not send a service-account JSON file or passwords in chat.
