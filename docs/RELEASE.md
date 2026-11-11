# Going live — checklist

Work through this in order. Each step says where to click and what to copy. Anything in `CAPITALS_LIKE_THIS`
or `<angle brackets>` is a value you must supply. Section 11 lists every placeholder in one table.

**What ships where**

| Piece | Where it runs | Built with |
|---|---|---|
| Website (also what invite links open) | Vercel or Netlify, on your domain | `npm run build:web` → `dist/` |
| Android app | Google Play | `eas build -p android --profile production` |
| iPhone app | App Store | `eas build -p ios --profile production` |
| Backend | Supabase | `supabase db push`, `npm run deploy:functions` |

You can launch the website alone first (steps 1–4 and 9) and add the store apps later; invite links keep working.

**Accounts to open first** (some take days to approve — start now)

- [ ] Domain name (this guide assumes `letsplaytambola.app`; if you own a different one, use it everywhere below)
- [ ] Supabase (free tier is enough to start)
- [ ] Vercel or Netlify
- [ ] Expo account (<https://expo.dev>) — for EAS builds
- [ ] Google Play Console — one-time US$25. New *personal* accounts must run a closed test with 12+ testers for 14 days before going public; an *organisation* account avoids that but needs a D-U-N-S number
- [ ] Apple Developer Program — US$99/year
- [ ] Google Cloud project (for "Sign in with Google")
- [ ] An SMS provider and **DLT registration** (India) — 2–7 working days

---

## 1. Supabase

Follow **[`supabase/README.md`](../supabase/README.md) → Setup, steps 1–7** exactly (project in Mumbai, auth providers,
database, Edge Function, Realtime). Come back here when it says "Point the app at it".

Before you deploy, the same checks CI runs:

```sh
npm run test:sql
```

```sh
npm run test:functions
```

(The first needs a local PostgreSQL; the second needs Deno — `npm i -g deno`.)

## 2. SMS codes (OTP) in India

Follow **`supabase/README.md` → "SMS in India (DLT)"**. In short: register as a Principal Entity on a DLT portal,
register a sender ID and the OTP template, connect the provider in Supabase, and paste the *approved* template text
into Supabase word for word. Until that is approved, real Indian numbers will not receive codes — use the
**Test OTP numbers** from the same README for your own testing and for the store reviewers.

- [ ] Send a code to a Jio, an Airtel and a Vi number. All three arrive within 30 seconds.

## 3. Google and Apple sign-in

Details are in `supabase/README.md` step 2. What you need to collect:

| Provider | Where | What to paste into Supabase |
|---|---|---|
| Google | Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → *Web application*. Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. Also fill in the OAuth consent screen (app name, support email, your domain, privacy-policy link) and press **Publish app**, or only test users can sign in | Client ID and Client secret |
| Apple | developer.apple.com → Certificates, Identifiers & Profiles. (a) Identifiers → App ID `com.letsplaytambola.app` → tick *Sign in with Apple*. (b) Identifiers → new **Services ID** (e.g. `com.letsplaytambola.web`), enable Sign in with Apple, domain `<project-ref>.supabase.co`, return URL as above. (c) Keys → new key with Sign in with Apple → download the `.p8` | Client IDs: `com.letsplaytambola.app,com.letsplaytambola.web`; and the secret generated from the `.p8` (Supabase's Apple provider page explains how; it **expires every 6 months** — put a reminder in your calendar) |

Then Supabase → Authentication → URL Configuration: Site URL = your website; Redirect URLs =
`https://<your-domain>/**`, `http://localhost:8081/**`, `letsplaytambola://**`.

## 4. Environment variables

Every variable is explained in [`.env.example`](../.env.example). They are needed in **three** places — keep them identical:

| Where | How |
|---|---|
| Your computer | copy `.env.example` to `.env` and fill it in |
| Web host | Vercel: Project → Settings → Environment Variables. Netlify: Site configuration → Environment variables |
| Store builds | `eas.json` → `build.base.env` (replace the `REPLACE_WITH_…` values) |

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the anon / publishable key. **Never** the service-role key |
| `EXPO_PUBLIC_WEB_URL` | `https://<your-domain>` — no trailing slash |
| `EXPO_PUBLIC_PLAY_URL` | leave empty until the Android app is public (step 8) |
| `EXPO_PUBLIC_APPSTORE_URL` | leave empty until the iPhone app is public (step 8) |
| `EXPO_PUBLIC_ADS_ENABLED` | `0` |

These values are baked in at build time: after changing one, rebuild and redeploy the website **and** make new app builds.
If both Supabase values are empty the build runs in *demo mode* (data stays on the device) — fine for trying things, wrong for launch.
`eas.json` → `development` is deliberately set to demo mode.

## 5. Website and domain

1. Push this repository to GitHub. CI (`.github/workflows/ci.yml`) should go green.
2. **Vercel**: Add New → Project → import the repo. `vercel.json` already sets the build command, the output folder and the rules
   that make `/g/CODE` links work. **Netlify** works the same way through `netlify.toml`. Use one, not both.
3. Add the variables from step 4, then deploy.
4. Add your domain in the host's Domains page and create the DNS records it shows you at your registrar. HTTPS is automatic.
   Pick one address (`letsplaytambola.app`, without `www`) and let the host redirect the other to it.
5. Check:
   - [ ] `https://<your-domain>/` loads and signing in with a phone number works
   - [ ] `https://<your-domain>/g/ABCDE` shows "Game ABCDE isn't here" (not a "404 Not Found" page from the host)
   - [ ] `https://<your-domain>/og.png` shows the logo
   - [ ] Send yourself the site link on WhatsApp — the preview shows the logo, title and description.
         WhatsApp remembers previews for days; to re-test after a change add `?v=2` to the link

## 6. Links that open the installed app

Two small files on the website tell phones "this app is allowed to open these links". Both ship with placeholders, and
`npm run build:web` prints a warning until they are filled in. You can do this after the first store builds exist (step 7) —
the website works without it; links just open in the browser.

Fill them in **either** by editing the files in `public/.well-known/`, **or** by setting two extra variables on the web
host (the build writes them into the files): `APPLE_TEAM_ID` and `ANDROID_SHA256_FINGERPRINTS` (comma-separated).

| File | Placeholder | Where to find the value |
|---|---|---|
| `apple-app-site-association` | `REPLACE_WITH_APPLE_TEAM_ID` | <https://developer.apple.com/account> → Membership details → **Team ID** (10 letters/digits) |
| `assetlinks.json` | `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` | Play Console → your app → Test and release → Setup → **App signing** → *App signing key certificate* → SHA-256. (Wording moves around; older consoles show it under Setup → App integrity.) |
| `assetlinks.json` | `REPLACE_WITH_UPLOAD_KEY_SHA256_…` | Optional, for builds installed outside Play (the `preview` APK): run `eas credentials -p android` and copy the SHA-256 fingerprint. Otherwise delete that line (and the comma before it) |

Redeploy the website, then check:

- [ ] `https://<your-domain>/.well-known/apple-app-site-association` opens as text and shows your Team ID
- [ ] `curl -sI https://<your-domain>/.well-known/apple-app-site-association | grep -i content-type` says `application/json`
- [ ] `https://<your-domain>/.well-known/assetlinks.json` shows your fingerprint
- [ ] Google's checker returns your app: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<your-domain>&relation=delegate_permission/common.handle_all_urls`
- [ ] With the app installed, tapping an invite link **in WhatsApp** opens the app. (Typing the link into the browser's address bar never opens an app — that is normal.) iPhones fetch the file through Apple's servers, so allow up to a day after the first deploy; reinstalling the app forces a re-check

The domain is compiled into the apps from `EXPO_PUBLIC_WEB_URL` (`app.config.ts`). **If the domain changes, the apps must be rebuilt and resubmitted.**

## 7. App builds (EAS)

```sh
npm i -g eas-cli
```

```sh
eas login
```

```sh
eas init
```

`eas init` links the project to your Expo account and writes a project id into the app config — commit that change.

1. Put the real values into `eas.json` (step 4).
2. Try a test build on your own phones first:

   ```sh
   eas build -p android --profile preview
   ```

   This gives an APK link/QR code you can install directly. For iPhone, `eas build -p ios --profile preview` needs your
   test devices registered first (`eas device:create`); `preview-simulator` builds for the Mac simulator instead.
3. Run the test script in section 10 on those builds.
4. Production builds:

   ```sh
   eas build -p android --profile production
   ```

   ```sh
   eas build -p ios --profile production
   ```

   Let EAS create and keep the signing keys when it asks (answer yes). Build numbers go up automatically.

App identity, already set in `app.json`: name **Letsplaytambola**, Android package and iOS bundle id `com.letsplaytambola.app`.
These can never be changed after the first store upload — confirm them before step 8.

Icons and splash are generated from the designer's artwork by `npm run assets` (`scripts/make-assets.py`); you only
need to run it if the artwork changes.

## 8. Store submission

Have ready for both stores:

- [ ] **Privacy policy** at a public URL (e.g. `https://<your-domain>/privacy`). *Not written yet — see section 12*
- [ ] **Account deletion**: both stores require a way to delete your account from inside the app, and Google also wants a web link for it. *Not built yet — see section 12*
- [ ] Support email address and (Play) a contact phone/website
- [ ] A **reviewer login**: a Supabase test phone number + fixed code (`supabase/README.md` → "Test OTP numbers"), valid for at least a month
- [ ] Screenshots of: Home, New game, Lobby, Play (ticket with numbers called), Results. Use a made-up family, not real contacts
- [ ] Short description (80 characters) and full description. Include this sentence in both: **"Letsplaytambola is for fun with family and friends. It has no real-money gaming: the app never takes, holds or pays out money. Any ticket price or prize a host types in is only a note, settled by the group outside the app."**

### Google Play

1. Play Console → Create app. Name *Letsplaytambola*, default language English (India), **Game**, **Free**.
2. Upload the `.aab` to **Internal testing** first: `eas submit -p android --profile production` (the first upload may have to be done by hand in the console; after that `eas submit` works with a service-account key — the command walks you through it).
3. Now copy the **App signing SHA-256** into step 6 and redeploy the website.
4. App content forms:
   - **Privacy policy**: your URL
   - **App access**: "All or some functionality is restricted" → give the reviewer phone number and code
   - **Ads**: No (change this if ads are ever switched on — `docs/ADS.md`)
   - **Content rating** questionnaire: category Game. Answer honestly: no violence, no sexual content; *users can interact* (emoji reactions, names) — yes; *simulated gambling* — Tambola is a game of chance, so say yes if asked about simulated gambling, and **no** to real-money gambling
   - **Target audience**: 18 and over (simplest; avoids the children's-apps rules)
   - **Real-money gambling, games and contests** declaration: **No**
   - **Data safety**: collected — Phone number (account management, app functionality), Name, Email (only with Google/Apple sign-in), User IDs, Contacts (see below; optional), App interactions. Encrypted in transit: yes. Users can request deletion: yes (needs section 12). Shared with third parties: no. No advertising or tracking
   - **Contacts**: in Data safety state that contacts are optional and are used only to find friends and send invites the user chooses. Suggested wording for any permission question: *"The host can pick people from their phone's contacts to invite to a game. Phone numbers are turned into one-way hashes on the device; only the hashes are sent, to show which contacts already play. Names and numbers the host picks are stored so the host can message them on WhatsApp themselves. Nothing is ever sent to a contact automatically. The app works fully without this permission."*
5. Store listing: icon `assets/icon.png` (Play wants 512×512 — resize it), feature graphic 1024×500 (make one from `docs/design_handoff/assets/logo-on-plum-4x.png`), at least 2 phone screenshots.
6. Internal testing → (closed testing, if your account type requires it) → Production. Review usually takes 1–7 days.
7. When it is public, set `EXPO_PUBLIC_PLAY_URL=https://play.google.com/store/apps/details?id=com.letsplaytambola.app` on the web host and redeploy.

### App Store

1. App Store Connect → Apps → **+** → New App. Platform iOS, bundle id `com.letsplaytambola.app`, SKU `letsplaytambola`.
   Copy the numeric **Apple ID** of the app (App Information page) and your **Team ID** into `eas.json` → `submit.production.ios`.
2. `eas submit -p ios --profile production` uploads the build to TestFlight. Test it there first.
3. **App Privacy** form: Contact Info — Phone Number, Name, Email Address; Contacts; Identifiers — User ID; Usage Data — Product Interaction. All *linked to the user*, purpose *App Functionality*, **not** used for tracking.
4. **Age rating** questionnaire: everything "None" except *Simulated Gambling* — answer truthfully (Tambola is a game of chance played here without money); expect a 12+ or 17+ result depending on your answer. *Gambling and Contests*: **No**.
5. **Review notes** (paste and adapt): *"Tambola (Housie) is a traditional Indian family number game, like bingo. This app has no real-money gaming, no in-app purchases and no payments: prices and prizes a host enters are text only and settled outside the app. Sign in with phone number +91 XXXXX XXXXX, code 123456. Contacts access is optional and only used when a host chooses friends to invite; nothing is sent to anyone automatically. To test a multiplayer game, open the invite link from the lobby in Safari on another device."*
6. Sign in with Apple is offered on iPhone because Google sign-in is (Apple requires this); it is already built.
7. Screenshots: 6.9" iPhone (1320×2868) is required; iPad 13" too, because the app currently allows iPad (`supportsTablet` in `app.json` — set it to `false` *before the first upload* if you do not want to make iPad screenshots).
8. Export compliance is answered automatically (`ITSAppUsesNonExemptEncryption: false` — the app only uses standard HTTPS).
9. Submit for review (typically 1–3 days). When it is public, set `EXPO_PUBLIC_APPSTORE_URL` to the App Store link on the web host and redeploy.

## 9. How invites reach the right place

| Person taps an invite link and… | What happens |
|---|---|
| has the app (after step 6) | the app opens on that game |
| has no app | the website opens on that game; they join in the browser — no download needed |
| …then taps "Get the app → Google Play" and installs | the Play link carries the game code; on first open the app goes to that game (after `app/_layout.tsx` calls `checkInstallReferrer()` — see `src/lib/install.ts`) |
| …then installs on iPhone | Apple offers no such hand-over. The invite page shows the 5-character code; they type it into "Have a game code?" on Home, or simply tap the invite link again |

The "Get the app" line only appears on the website, and only once `EXPO_PUBLIC_PLAY_URL` / `EXPO_PUBLIC_APPSTORE_URL` are set.

## 10. Pre-launch test (2 phones + 1 computer, about 20 minutes)

Use the production website and store-track builds (Play internal testing / TestFlight). **A** = Android phone with the app,
**B** = iPhone with the app, **C** = a computer browser, signed out. Tick every line.

1. [ ] **A**: open the app, sign in with a real phone number. The SMS arrives; you choose a username once.
2. [ ] **A**: Host a game → name it, 6 seats, ₹50 ticket, add prizes → Create. Lobby opens. The price shows "Settled outside the app" and there is no pay button anywhere.
3. [ ] **A**: Share to WhatsApp → send to **B**. The message shows the logo preview.
4. [ ] **B**: tap the link in WhatsApp → **the app opens** (not Safari) on the invite → sign in → you are in the lobby with a ticket, no extra screen.
5. [ ] **C**: type the invite link into the browser → invite page → enter just a name → Join → lobby. The "Get the app" line shows (if the store links are set) and joining needed no download.
6. [ ] **A** shows 3 players. **B** and **C** show a waiting lobby and no "start" control.
7. [ ] **A**: Start calling → draw 5 numbers. Each number appears on **B** and **C** within about 2 seconds; the voice reads it on A.
8. [ ] **B**: tap a number that has *not* been called → refused. Tap a called number on your ticket → it is dabbed.
9. [ ] **C**: press a prize claim you have not earned → refused ("bogey"), and A and B see it in the feed.
10. [ ] Look at all three screens side by side: nobody can see anyone else's ticket or how many numbers they have dabbed.
11. [ ] **B**: turn on aeroplane mode, **A** draws 3 more numbers, **B** turns it off → B catches up and its earlier dabs are still there.
12. [ ] **A**: switch on auto-call and let it run until someone can truthfully claim → claim → all three show the winner. A second player claiming the same prize is told it already went to the first.
13. [ ] **A**: End game → Results on all three → Settle up on A adds up correctly (the host's own ticket is not counted as a cost).
14. [ ] **C**: open the same link again → results, not a new game. Open `https://<your-domain>/g/ZZZZZ` → "isn't here" message.
15. [ ] **A**: Host again → Who's playing → Contacts: the permission explanation comes first; allow; pick a contact; nothing is sent until you press send yourself.
16. [ ] **B** (iPhone): sign out → Sign in with Apple works. **C**: sign out → Sign in with Google works and asks for a mobile number once.
17. [ ] **Fresh install, Android**: uninstall the app on A. Open an invite link in Chrome → "Get the app → Google Play" → install → open. The app goes to that game after sign-in. (Only works for installs that come from Play itself, internal testing included.)
18. [ ] Force-close and reopen the app on A and B during a live game → you return to the game from Home ("Happening now").

Stop the launch if 4, 8, 9, 10 or 12 fails.

## 11. Every placeholder, in one place

| Where | Placeholder | Becomes |
|---|---|---|
| everywhere (`.env`, web host, `eas.json`, default in `app.config.ts`, `src/lib/links.ts`, `public/index.html`, `scripts/web-postbuild.js`) | `https://letsplaytambola.app` | your confirmed domain (set `EXPO_PUBLIC_WEB_URL`; change the defaults only if the domain is different) |
| `.env`, web host, `eas.json` | `EXPO_PUBLIC_SUPABASE_URL` / `REPLACE_WITH_PROJECT_REF` | Supabase project URL |
| `.env`, web host, `eas.json` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `REPLACE_WITH_SUPABASE_ANON_KEY` | Supabase anon key |
| web host | `EXPO_PUBLIC_PLAY_URL`, `EXPO_PUBLIC_APPSTORE_URL` | store page links, once public |
| `public/.well-known/apple-app-site-association` (or `APPLE_TEAM_ID`) | `REPLACE_WITH_APPLE_TEAM_ID` | Apple Team ID |
| `public/.well-known/assetlinks.json` (or `ANDROID_SHA256_FINGERPRINTS`) | `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT`, `REPLACE_WITH_UPLOAD_KEY_SHA256_FINGERPRINT_OR_DELETE_THIS_LINE` | certificate fingerprints |
| `eas.json` → `submit.production.ios` | `REPLACE_WITH_APP_STORE_CONNECT_APP_ID`, `REPLACE_WITH_APPLE_TEAM_ID` | numeric app id, Team ID |
| `app.json` | `com.letsplaytambola.app` (Android package, iOS bundle id) | confirm before the first upload — permanent afterwards |
| Supabase dashboard | SMS provider keys, DLT entity/template ids, Google client id/secret, Apple Services ID + secret, test phone numbers | see `supabase/README.md` |

## 12. Known gaps to close before store review

- **Privacy policy and terms pages** do not exist. Both stores and the Google sign-in consent screen need a privacy-policy URL. It must name the legal owner, and cover phone number, name, email, hashed contacts, where data is stored (Supabase, Mumbai) and how to delete it.
- **Delete my account** is not in the app. Apple (guideline 5.1.1(v)) and Google Play both reject apps with sign-up but no in-app deletion; Play also needs a web URL for deletion requests.
- The first-launch hand-over from Play (section 9) needs one line added to `app/_layout.tsx`; until then the code is set aside but nothing calls it.

## 13. Optional: per-game link previews

Today every link shows the same WhatsApp preview ("Let's play Tambola!" + logo), because the website is a single page and
preview robots do not run JavaScript. To show "Priya invited you to Diwali Night" instead, put a small server function in
front of `/g/*`:

1. It runs only when the visitor is a preview robot (User-Agent contains `WhatsApp`, `facebookexternalhit`, `Twitterbot`, `Slackbot`, `TelegramBot`, …). Everyone else gets `index.html` as now.
2. It reads the game's public summary — `POST https://<project-ref>.supabase.co/rest/v1/rpc/peek_game` with the anon key and the code (the same signed-out call the invite page makes; it exposes only the game name, host first name, price and seats). Check the exact argument name in `supabase/migrations/0001_init.sql`.
3. It returns a tiny HTML page with `og:title` = "{host} invited you to {game name}", `og:description`, `og:image` = `/og.png` (or a generated image), `og:url` = the link. HTML-escape the names. Cache for a minute.

On Vercel this is a `middleware.ts` or a function under `api/` plus a rewrite placed *before* the catch-all in `vercel.json`;
on Netlify, an Edge Function declared for the path `/g/*`. About 40 lines. Do not switch the Expo build to server rendering
just for this.

## 14. What was not verified when this was prepared

Prepared in an offline sandbox with no store, Expo, Supabase or hosting accounts. **Verified there:** typecheck, unit tests,
the web export (including `dist/.well-known/*`, `og.png`, `manifest.json` and the preview tags), the database privacy
test on PostgreSQL 16 (both connection modes), `deno check` on the Edge Function and its handler test against a mocked
database, the generated icons (looked at), the invite page with the store links (looked at in headless Chrome), and
`expo prebuild` for Android (the generated manifest contains the verified `https://<domain>/g/` link filter, the custom
scheme and the contacts permission; launcher icon and splash image were generated and looked at).

**Not verified — check these yourself:**

- Any EAS build or real-device run; the iOS native project (no Mac here); `eas.json` is written from documentation, never executed. Android prebuild printed one notice: `userInterfaceStyle` needs the `expo-system-ui` package on Android — harmless (the app paints its own dark background), install it if you want the system bars to follow
- Universal links / App Links opening the app (needs real Team ID, fingerprint, domain and store-signed builds)
- The Play install referrer hand-over on a real install (logic is unit-tested with a fake referrer only)
- `vercel.json` and `netlify.toml` on the real hosts — in particular the `application/json` header on the extension-less Apple file (step 6 has the one-line check)
- The GitHub Actions workflow itself (its commands were run by hand; the workflow has never run on GitHub)
- The Edge Function against a real Supabase project; SMS delivery and DLT; Google and Apple sign-in
- The WhatsApp preview on a real phone
- Store-console menu names and policy details — they change often; treat the paths above as directions, not exact labels
- Whether `letsplaytambola.app` is available or owned by you (`.env.example` previously said `.com`)
