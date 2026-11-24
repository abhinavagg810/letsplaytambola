# Ads (Google AdSense)

Ads are **off** until `NEXT_PUBLIC_ADSENSE_CLIENT` is set. Nothing about the site changes before that.

## Where ads can appear
| Spot | Where | Env var for its ad unit id |
|---|---|---|
| Waiting room — players | Right under the player's ticket, on screen without scrolling | `NEXT_PUBLIC_ADSENSE_SLOT_LOBBY` |
| Waiting room — host | At the very bottom, far from Share and Start | `NEXT_PUBLIC_ADSENSE_SLOT_LOBBY` (same unit) |
| Results | Under the Play again / Host my own buttons with a gap, above the winners on phones | `NEXT_PUBLIC_ADSENSE_SLOT_RESULTS` |

**Owner's rule: no ads during the game.** There is no placement on the live game screen and none may be added.
Also none on the home page, host setup, ways to win, join pages, legal pages, the content pages (/about, /contact, /how-to-play, /ways-to-win, /tambola-number-calls) or admin.
Keep **Auto ads switched off** in AdSense — Auto ads place themselves anywhere, including the live game.

**Ad views in the admin:** Admin → Engagement → "Ad views" counts an ad as seen when at least half of it is on screen
for one second (event `ad_seen`, once per spot per page view). AdSense's own reports remain the source of truth for earnings.

## Switching on
1. Apply at https://adsense.google.com with the site's domain.
2. Add `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…` in Vercel (type Config) and redeploy. This adds the AdSense script and the
   verification tag to every page and serves `/ads.txt`, which is what Google checks to approve the site.
3. Wait for approval (days to a few weeks).
4. In AdSense create two **Display** ad units (responsive), copy each unit's numeric id into the two slot variables, redeploy.
5. In AdSense → Privacy & messaging, switch on the consent message for the EEA/UK (Google requires it for visitors from there).

With the client id set, the privacy policy page automatically gains an "Advertising" section (draft wording — have it reviewed).

## To add a placement
Add an entry to `AD_SLOTS` in `src/lib/ads.ts` and place `<AdSlot placement="…"/>` on the page. Do not add one to any game-in-progress screen.
