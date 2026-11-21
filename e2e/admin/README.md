# Admin + analytics end-to-end suite

`npm run build && bash e2e/admin/run.sh` — about four minutes. See the header of `run.sh` and `docs/qa/TEST_PLAN_ADMIN.md`.

It has its own small runner (plain Node + the globally installed Playwright) instead of `e2e/run.mjs`, because the admin
checks need servers that the player suite does not: a dataset with **known numbers** preloaded into the in-memory store
(`seed-preload.cjs`, loaded with `node --require` — the application code is not changed for it), a server with the admin
switched off, one with a different password, and one whose analytics reads fail.

| File | What |
|---|---|
| `seed-data.cjs` | The dataset: 8 hand-designed games / 143 events over the last 8 India days with hand-computed expectations (`EXPECT`), hostile names (`<script>`, `"><img onerror>`, `=HYPERLINK(...)`), two devices whose short ids collide, plus 320 generated games and ~6,500 events |
| `verify-data.cjs` | Every figure three ways: the page, the CSV export, and a recomputation written independently of the app |
| `verify-auth.cjs` | Sign-in, session, CSRF, "off", headers — routes and pages are enumerated from `src/app` |
| `verify-capture.cjs`, `verify-extra.cjs` | `POST /api/t` limits and spoofing, the browser tracker, the device token, behaviour before migration 0003 |
| `verify-sec.cjs`, `verify-erase.cjs` | Nothing private in public answers, stored XSS, CSV injection, "Erase a device" |
| `verify-ui.cjs`, `ui.cjs` | Ranges, tables, detail pages, error states, keyboard, print, timings; screenshots at seven widths (`QA_SHOTS=1`) |

Only placeholder credentials are used (`admin@example.com` / `test-password-123`).
