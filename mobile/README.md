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

**Stage 3 (built; needs real-phone testing): call-log sync**

Reads real call durations from the telecaller's phone and sends them to the API, for talk-time on the master dashboard. See [Call tracking](#call-tracking-what-is-read-and-why) below.

**Login screen animation.** The same scene as the web login: a Precon lorry delivering a precast sump, driving in once and then cruising while the town, road and water slide past (`src/components/delivery-scene.tsx`). It's plain views on the web's 400 x 160 canvas, scaled to the phone's width (`src/lib/scene.ts`, tested), animated with React Native's built-in `Animated` on the native driver (transforms and opacity only). No extra libraries, no images, nothing loaded before login. With Android's "Remove animations" on, it's a still picture.

**Navigation: a bottom tab bar per role.** Each tab is its own full screen; a lead, the searchable lead list, New lead, Notifications and Call tracking open above the tabs (Back returns to the tab). The tabs are chosen by role in `src/lib/tabs.ts` (tested); the routes live in `src/app/(tabs)/`. A field person shouldn't need the web app.

| Tab | Telecaller | Sales |
| --- | --- | --- |
| **Home** | `TelecallerHomeScreen`: counts (new today, due today, overdue, calls today), Start calling, New lead (if allowed), thought for today, my reminders (`GET /notifications/summary`), the next 3 to call, my pipeline (`GET /leads/summary`) | `SalesHomeScreen`: counts (my leads, due today, overdue, won this month), I'm at site, New lead, thought for today, my reminders, today's follow-ups (top 3), this month: won, won in total, lost, and revenue when operations are on |
| **My Leads** | `WorklistScreen`: the call list from `GET /dashboards/telecaller`, most urgent first, Call and WhatsApp on every card | `SalesLeadsScreen`: my handed-over leads, overdue follow-ups first, Call and WhatsApp on every card |
| 3rd | **Callbacks**: overdue, upcoming, done (`FollowUpsScreen`) | **Pipeline** (`PipelineScreen`): leads per stage as bars, then each stage with its leads, then this month's wins |
| 4th | **Calendar**: my callbacks by month (`CalendarScreen`) | **Site Visits** (`SiteVisitsScreen`): I'm at site, my visits on an OpenStreetMap map and as a list |
| **More** | Profile, Notifications, All my leads (search), New lead (if allowed), Call tracking, server, Log out | The same, plus Follow-ups and Calendar |

**My Leads opens on every lead you can see, loaded at once** (`components/leads-list.tsx`): a telecaller's assigned leads and the ones they handed to sales, a salesperson's own, everyone's for an admin. Search, the stage chips and the date filter only narrow it, and combine; "All time" applies no date filter. Each row has Call and WhatsApp. **Call order** (telecaller) / **Follow-up order** (sales) switches to the working queue, most urgent first.

**Admin in the app:** Home (today's team numbers, who needs attention: tap one for that person's leads, team results for any dates), **Leads** (all leads), **Follow-ups** (the whole team's), **Site Visits** (the team's, last 30 days), **More** (Calendar for the team, Reports, Notifications, New lead / Quick add, server, Log out last). Admins can **reassign** a handed-over lead from its page. Users, permissions, pipeline stages, templates and files are set up on the web only.

**Nothing is built into the app that the admin can change on the web.** Pipeline stages (`GET /pipeline-stages`), WhatsApp templates and their attached files (`GET /message-templates`, `GET /files`) are fetched from the server every time a screen or sheet opens, so new or renamed stages and templates show at once, without a new APK. "Move stage" offers every active stage to whoever owns the lead (telecaller or sales; admins any lead), grouped as Telecaller side / Sales side / Close, and says when a move will hand the lead to sales or back to the telecaller; the server does that (`lib/stages.ts`, tested).

Badges: Callbacks (telecaller) and My Leads (sales) show follow-ups overdue or due today; More shows unread notifications. Both lead lists start with a "Search all my leads" bar (`GET /leads`, any status). Other roles (admin) get Home and More only.

The OSM map is Leaflet in a WebView (`react-native-webview`), loading OpenStreetMap tiles. No Google Maps and no API key.

**Everything else a field person does on the web, also on the phone:**

| Feature | Who | API |
| --- | --- | --- |
| **Edit details** on the lead page: name, phone, city, product and size, email, notes. Only what changed is sent. | Sales (`leads.write`), telecallers on their own leads (`leads.qualify`), as on web | `PATCH /leads/:id` |
| **New lead** (button on Home, More → New lead, or + on All my leads): **Quick add** for a WhatsApp enquiry (phone only, round-robin to a telecaller, an open lead with the same number is caught) and the **full form** (assigned to you) | Quick add: `leads.quick_add`; full form: `leads.write`. Telecallers have neither, so they don't see it. | `POST /leads/quick-add`, `POST /leads` |
| **Follow-ups** ("Callbacks" for telecallers): overdue, upcoming and done. Tap one to mark it done with what happened, or move it. Also from the lead page's pending follow-ups. | Everyone with `followups.write` | `GET /follow-ups?state=…&assignedTo=me`, `POST /follow-ups/:id/complete`, `PATCH /follow-ups/:id` |
| **Calendar**: my follow-ups by month, coloured overdue/upcoming/done; tap a day to see and act on them | Everyone | `GET /follow-ups?from&to&assignedTo=me` |
| **Date filters**: Today, This week, This month, Last month, All time, or Custom (two date dialogs). On All my leads they combine with the status chips (Won / Lost by the day they closed, others by the day added); on Follow-ups / Callbacks by the day due; on both My Leads tabs by when the lead arrived or was handed to you | Everyone | `GET /leads?createdFrom&createdTo` (or `wonFrom&wonTo`), `GET /follow-ups?fromDate&toDate` |
| **Shared notes** on the lead page: the telecaller and the salesperson (and admins) see each other's notes; add one, tap your own to edit it. The others get a notification | `leads.write` or `leads.qualify` to write | `GET/POST /leads/:id/notes`, `PATCH /leads/:id/notes/:noteId` |
| **My results / Team results** on Home: the dashboard numbers for Today, This week, This month (default) or Last month | Everyone (admins see the team and each person) | `GET /dashboards/period?from&to` |
| **Notifications**: the web's bell. Reminders and updates, unread count on the bell (Home and every tab header) and on More, tap to open the lead (marks it read), Mark all read. | Everyone | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |

**Stage 4 (built; needs real-phone testing): sales workflow**

Salespeople get their own tabs, built on the telecaller screens and the same call, WhatsApp, outcome and call-log sync code:

- **Home** from `GET /dashboards/sales`: my open leads, follow-ups due today, overdue (red), won this month.
- **My Leads** tab: only leads assigned to them. Overdue follow-ups come first, then today's, then leads with no follow-up planned, then later ones. Each card shows who handed the lead over and has Call and WhatsApp buttons.
- **Call, WhatsApp and call outcome**: the same as telecallers, including call-log sync and the explanation screen the first time. The next step is called a "follow-up" for sales and a "callback" for telecallers; it's the same endpoint.
- **Lead page**: the same as telecallers, plus **Move stage** (any active stage, via `PATCH /leads/:id`), **I'm at site** and the lead's site visits.
- **I'm at site**: pick one of your leads (`GET /check-ins/leads`), take one GPS reading, and record it with the time on that lead (`POST /check-ins`). It works the same as the web check-in. The **Site Visits** tab has the button too, and lists recent visits on a map and, each with a link to it on OpenStreetMap.
- **This month** (on Home) and **Won this month** (on Pipeline): revenue this month (shown when the account has the `sales.read` tag), won this month, won in total, lost this month, and the deals won this month.

**Location.** The app asks for location "only while using the app". It reads it once, when "I'm at site" is tapped, and never in the background. Background location and foreground services are blocked in `app.json`, so the app can't track anyone.

**Next (not built yet)**

1. GPS attendance check-in and check-out (operations module, off for now).
2. Before real rollout: Precon app icon and splash screen.

## Call tracking: what is read and why

**Why.** So a telecaller's talk-time is counted from their real calls without typing it in. Admins see total talk-time and number of calls per telecaller on the master dashboard.

**What leaves the phone**, for calls to or from the user's own leads only: the phone number, direction (outgoing, incoming, missed, rejected), start time, duration in seconds, and Android's id for that call-log row.

**What is never read or sent:** calls with anyone who isn't one of the user's leads, calls from before tracking was turned on or while it was off, contact names, and call audio. The app doesn't record calls.

How that's enforced:

- Android's permission technically opens the whole call log, so the limit is in this app's code. The native module (`modules/call-log`) asks only for rows newer than the last sync and only for the five columns above.
- It's given the list of the user's lead numbers from `GET /device-calls/lead-numbers`, and drops every other row inside the module. A non-lead call never reaches the app's JavaScript, storage or the network.
- The first sync only starts the clock. No past calls are read. Turning the permission off resets this, so turning it back on starts fresh.

**Permission flow.** A telecaller sees the explanation screen once, the first time they reach their worklist. It's also under More → Call tracking.

| State | What happens |
| --- | --- |
| Allowed | Calls sync automatically. The screen shows the last sync and a **Sync now** button. |
| Refused | The app works as normal with calls logged by hand. They can tap Allow again later. |
| Refused for good ("don't ask again") | The screen explains and offers **Open Settings**. |
| Not available (Expo Go or no native module) | The screen says so. Nothing is read. |

Nothing in this flow can crash the app: a refusal, or an unreadable call log, simply means no automatic sync.

**"Restricted setting" on sideloaded installs.** Newer Android versions may refuse this permission for apps installed from a file. If so: Settings → Apps → Precon Sump → ⋮ → **Allow restricted settings**, then allow Call logs. This hasn't been confirmed on a real phone yet.

**Google Play.** Play only allows the call-log permission for a few app categories such as default dialers, so this app would likely need this feature removed or a declaration approved to be published there. It's distributed as a direct APK, where this doesn't apply.

**When it syncs:** when the app opens, whenever it returns to the foreground, and again 5 and 15 seconds after returning from a call placed with the Call button, because Android can take a moment to write the entry.

**Incoming calls from leads.** All four directions are read, including calls the customer made to you and calls dialled outside the app. Each one is stored on the matching lead (last 10 digits, among the leads you can see) with its direction and duration, and appears in the lead's "Calls and messages" (app) and "Calls, messages & visits" (web).

**"How did the call go?" after an answered incoming call.** When a sync finds an answered incoming call (longer than 0 seconds) on one of your open leads, from the last 2 days, that you haven't logged an outcome for since, the app opens the usual outcome form over whichever tab is open, saying who called, when and for how long. Saving logs the call at the time it happened, marked "Incoming call" in the history, with the same effects as any logged call: it closes your pending callbacks on that lead, can set the next one, and "Interested" goes on to Qualify. **Skip, don't log it** drops the prompt; the call itself stays on the lead. One prompt per lead (its latest call), one at a time; they are kept on the phone until answered or skipped, and each call is asked about only once. Missed, rejected, unanswered and outgoing calls never prompt (the app already asks after its own Call button). The server decides which calls qualify (`toLog` in the sync reply).

**Offline.** There's no separate queue: the phone's call log is the queue. The sync position only moves forward after the server confirms, so calls made offline are sent on the next successful sync. A failed sync retries every minute while the app is open. Each read looks back 2 hours, because Android dates a call by when it started but only writes it when it ends.

**No duplicates.** The server stores each call once per user, phone row id and start time, so re-sending, or reinstalling the app, can't double-count. The user always comes from the login token, so nobody can post calls for someone else, and a call only attaches to a lead the user can see with that number on it.

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
| Emulator, dev build (`npm run android`) | Your Mac's Wi-Fi address, or `http://10.0.2.2:4000` |
| Real phone, dev build | Your Mac's Wi-Fi address; the phone must be on the same Wi-Fi |
| Release APK (`npm run apk`) | `https://crm.preconsump.com` (HTTPS only, see below) |

**The release APK only connects over HTTPS.** Cleartext (plain `http://`) traffic is off in release builds (`usesCleartextTraffic: false` in `app.json`), so logins and lead data are always encrypted in transit. The login screen refuses an `http://` server address with a plain message, and adds `https://` when no scheme is typed. Debug builds keep plain HTTP allowed (Expo's debug manifest), so testing against your Mac's local API still works with `npm run android`. To test the release APK itself, point it at an HTTPS server.

The API listens on all network interfaces by default, so phones can reach it. `/api/v1` is added for you if you leave it off.

## Build an APK to send to a phone

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://crm.preconsump.com/api/v1 npm run apk
```

Release APKs must point at an HTTPS server (see above); `.env` holds your Mac's address for dev builds, so pass the live one when building.

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
- **APK won't install over an older one** ("App not installed" / package conflicts): the installed app was signed with a different key, e.g. a debug-signed build from before 17 Nov 2026. Uninstall it once, then install (see Signing).

## Signing

Release APKs are signed with **Precon's private key**. Android only installs an update over the app if it's signed with the same key, so this key is what lets you update everyone's app.

| | |
| --- | --- |
| Key | `~/.precon-signing/precon-release.jks` (PKCS12, RSA 4096, valid until about 2056), alias `precon-release` |
| Password | in `~/.precon-signing/signing.properties`, next to the key (both readable only by you) |
| Fingerprint (SHA-256) | `C7:1F:B8:B9:CB:7C:6C:84:7F:A0:A0:33:47:0E:51:94:78:84:26:98:8D:AD:D2:A8:C5:79:11:D6:03:D0:FA:56` |

Neither file is in the repo. `plugins/with-release-signing.js` points release builds at them, so `npm run apk` signs automatically and prints the certificate when it's done. A release build without the key stops with an error instead of falling back to the template's public debug key. Debug builds (`npm run android`) are unaffected.

**Back up both files.** Keep a copy off this Mac, e.g. in your password manager as attachments. If the key is lost, installed apps can't be updated: everyone would have to uninstall and install again. If it leaks, someone else could sign an "update", so don't share it.

**Building on another Mac:** copy both files into `~/.precon-signing/` there (keep the permissions private), or set `PRECON_SIGNING_PROPERTIES` to wherever `signing.properties` is. Run `scripts/create-signing-key.sh` **only once ever**. It refuses to overwrite an existing key.

**Check which key an APK has:** `~/Library/Android/sdk/build-tools/37.0.0/apksigner verify --print-certs build/precon-sump.apk`. The SHA-256 should match the fingerprint above.

**One-time switch:** APKs built before 17 Nov 2026 used the debug key. A phone that has one of those must **uninstall it once** before installing a Precon-signed APK; Android refuses to install over it. After that, every update installs over the top.

## Layout

```
src/app/              routes (expo-router): login, offline, worklist, lead/[id]
src/session.tsx       session state and the signed-in API helper
src/api.ts            calls to the existing API
src/storage.ts        token and server address (SecureStore)
src/lib/              server address, phone number and workflow rules (tested: npm test)
src/screens/          Login, Worklist, Lead
src/components/       buttons, sheets (log call, callback, WhatsApp, qualify), lead actions
src/call-sync.ts, src/use-call-sync.ts, src/call-permission.ts   call tracking
src/lib/call-sync.ts  call tracking rules (tested without a device: npm test)
modules/call-log/     Android module that reads the call log (Kotlin)
scripts/android.sh    run / apk, using Android Studio's JDK and SDK
scripts/create-signing-key.sh   creates the release signing key (once ever)
plugins/with-release-signing.js signs release builds with that key
android/              generated by `expo prebuild`; not in git
```
