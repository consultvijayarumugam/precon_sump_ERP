# Precon Sump mobile app (Android)

React Native + Expo app for telecallers and sales. It talks to the existing NestJS API in `/api` (same users, same endpoints); there is no separate backend. Distribution is a directly installed APK (sideload), not the Play Store.

## Status

**Stage 1 (done): foundation**

- Expo SDK 58 project, Android only, package `com.preconsump.crm`.
- Configurable API address: built in from `.env`, changeable on the login screen.
- Login against `POST /api/v1/auth/login`. The token is kept in `expo-secure-store` (encrypted with the Android Keystore).
- Home screen: "Logged in as <name> (<role>)". On launch a saved token is checked with `GET /auth/me`; an expired one returns to login.
- Logout calls `POST /auth/logout`, so the token stops working on the server too.
- Release APK built locally, no Expo account needed.

**Stage 2 (done): telecaller workflow**

- Worklist from `GET /dashboards/telecaller`: most urgent first (overdue, due today, new, no callback set, later), four summary counts, pull to refresh.
- Call opens the phone's dialer with the number and logs the attempt. The outcome form is waiting when you come back.
- Log an outcome with one-tap callback times or a date and time picker. "Not interested" and "Wrong number" close the lead as Lost.
- WhatsApp: pick a template and any library files (sent as links). The server fills in the message and logs it on the lead, then WhatsApp opens.
- Qualify and hand over to the next salesperson in turn or a chosen one. The lead then leaves the worklist. Logging "Interested" goes straight to this form.
- Lead detail: info, follow-ups, calls and messages, and all the actions above.

No backend changes were needed.

**Next (not built yet)**

1. Sales workflow: pipeline, follow-ups.
2. Call-log sync: read the phone's call log (needs the `READ_CALL_LOG` permission and a native module, which is why this project uses native builds rather than Expo Go) and match calls to leads.
3. GPS: one-time location reading for site visits and attendance, shown on an OSM map (never Google Maps; no live tracking).
4. Before real rollout: HTTPS server address and `usesCleartextTraffic` off, an app-owned signing key (see below), Precon app icon and splash screen.

## Tools you need (Mac)

| Tool | Notes |
| --- | --- |
| Node.js 20+ | Already installed (v24) |
| Android Studio | Already installed. Provides the SDK, emulator and JDK; `scripts/android.sh` finds them by itself |

The first build downloads Gradle, the Android NDK, Build-Tools and CMake (about 10 minutes and several GB of disk). Later builds take about 2 minutes. No Expo or EAS account is needed.

On another Mac: install Android Studio, open it once and finish the setup wizard, then in Device Manager create a phone emulator.

## Setup

```bash
# 1. Start the API in another terminal (the database must be running)
cd api && npm run start:dev

# 2. Install and configure the app
cd mobile
npm install
cp .env.example .env     # then set EXPO_PUBLIC_API_URL
```

`EXPO_PUBLIC_API_URL` is your Mac's Wi-Fi address (`ipconfig getifaddr en0`), port 4000, e.g. `http://192.168.31.50:4000/api/v1`. It's built into the app, so rebuild after changing it, or use **Server → Change** on the login screen, which needs no rebuild and is remembered on that phone.

| Running on | Server address |
| --- | --- |
| Emulator | Your Mac's Wi-Fi address, or `http://10.0.2.2:4000` |
| Real phone | Your Mac's Wi-Fi address; the phone must be on the same Wi-Fi |
| Later | `https://your-real-server` |

The API listens on all network interfaces by default, so phones can reach it. `/api/v1` is added for you if you leave it off.

## Build an APK to send to a phone

```bash
cd mobile
npm run apk
```

The result is `mobile/build/precon-sump.apk` (about 48 MB, for ARM phones running Android 7 or later). Send it by WhatsApp, Drive or USB. On the phone, open the file and allow "Install unknown apps" for the app you opened it from.

## Test on the Android emulator

Start the emulator (Android Studio → Device Manager → ▶), then either:

```bash
# A: the real APK
~/Library/Android/sdk/platform-tools/adb -e install -r build/precon-sump.apk

# B: dev mode, code changes reload live
npm run android
```

If a phone is also plugged in, pick the emulator with `npm run android -- --device Medium_Phone_API_37.0`.

## Test on a real Android phone

Over the APK: send `build/precon-sump.apk` to the phone and install it as above. Or by USB:

1. On the phone, Settings → About phone → tap **Build number** 7 times. Then Developer options → turn on **USB debugging**.
2. Plug in the phone and accept the "Allow USB debugging" prompt.
3. Check it's listed: `~/Library/Android/sdk/platform-tools/adb devices`
4. Install: `~/Library/Android/sdk/platform-tools/adb -d install -r build/precon-sump.apk`, or `npm run android` for dev mode.

Then log in with `telecaller@precon.local` and the `SEED_USER_PASSWORD` from `api/.env`. You should see **Hi Tara** and the call list.

## Troubleshooting

- **"Can't reach the server"**: the phone must be on the same Wi-Fi as the Mac, the API must be running, and the address must be current (the Mac's Wi-Fi address can change). Open `http://<mac-address>:4000/api/v1/health` in the phone's browser to check. Guest Wi-Fi often blocks devices from seeing each other.
- **Android asks to "find, connect to... nearby devices"** in dev mode (`npm run android`, Android 17): tap **Allow**. The dev build uses it to reach the code server on your Mac. The APK didn't ask for it in testing.
- **`adb: more than one device`**: use `adb -e` for the emulator or `adb -d` for the USB phone.
- **APK won't install over an older one**: uninstall the old one first if it was signed by a different machine (see below).

## Signing

Release builds currently use the Expo template's debug key, which is fine for internal testing. Before giving the app to the team, create a private keystore and keep it safe: Android only installs updates signed with the same key.

## Layout

```
src/app/              routes (expo-router): login, offline, worklist, lead/[id]
src/session.tsx       session state and the signed-in API helper
src/api.ts            calls to the existing API
src/storage.ts        token and server address (SecureStore)
src/lib/              server address, phone number and workflow rules (tested: npm test)
src/screens/          Login, Worklist, Lead
src/components/       buttons, sheets (log call, callback, WhatsApp, qualify), lead actions
scripts/android.sh    run / apk, using Android Studio's JDK and SDK
android/              generated by `expo prebuild`; not in git
```
