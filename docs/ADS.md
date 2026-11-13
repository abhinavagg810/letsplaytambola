# Ads (Google AdSense)

Ads are **off** until `NEXT_PUBLIC_ADSENSE_CLIENT` is set. Nothing about the site changes before that.

## Where ads can appear
| Placement | Page | Env var for its ad unit id |
|---|---|---|
| `home` | Home page, between "How it works" and "Features" | `NEXT_PUBLIC_ADSENSE_SLOT_HOME` |
| `host` | Host setup page, below the form and the Create button | `NEXT_PUBLIC_ADSENSE_SLOT_HOST` |
| `join` | "Join with a code" page, under the cards | `NEXT_PUBLIC_ADSENSE_SLOT_JOIN` |
| `results` | Results screen, after a game is over | `NEXT_PUBLIC_ADSENSE_SLOT_RESULTS` |

Never on: ways to win, the join-by-name card, the lobby, the live game, legal pages, admin.
Keep **Auto ads switched off** in AdSense — Auto ads place themselves anywhere, including the live game.

## Switching on
1. Apply at https://adsense.google.com with the site's domain.
2. Add `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…` in Vercel (type Config) and redeploy. This adds the AdSense script and the
   verification tag to every page and serves `/ads.txt`, which is what Google checks to approve the site.
3. Wait for approval (days to a few weeks).
4. In AdSense create four **Display** ad units (responsive), copy each unit's numeric id into the four slot variables, redeploy.
5. In AdSense → Privacy & messaging, switch on the consent message for the EEA/UK (Google requires it for visitors from there).

With the client id set, the privacy policy page automatically gains an "Advertising" section (draft wording — have it reviewed).

## To add a placement
Add an entry to `AD_SLOTS` in `src/lib/ads.ts` and place `<AdSlot placement="…"/>` on the page. Do not add one to any game-in-progress screen.
