# Ads plan (not built yet)

The PRD says **no ads during a game**, so ads are limited to browsing screens. The app already has the seams:

| Placement id | Screen | Format |
|---|---|---|
| `home_feed` | Home, below "Play again with" | Banner / native |
| `games_list` | Games tab, after the list | Banner |
| `results_footer` | Results and Settle up, below the buttons | Banner; optional interstitial *after* "Done" |

Never on: sign-in, create, prizes, lobby, play, any sheet.

`src/lib/ads.tsx` exports `<AdSlot placement="…"/>`, already placed on those screens. It renders nothing until `EXPO_PUBLIC_ADS_ENABLED=1`.

## To switch on later
1. **Accounts**: AdMob app ids for iOS and Android, AdSense for the web build. Publish `app-ads.txt` on the site domain.
2. **Native**: add `react-native-google-mobile-ads` + its config plugin (app ids in `app.json`). This needs a development/EAS build — it does not run in Expo Go.
3. **Web**: load the AdSense script once and render a responsive unit inside `AdSlot` when `Platform.OS === 'web'`.
4. **Consent**: Google UMP consent form before the first request; iOS App Tracking Transparency prompt; request non-personalised ads until consent.
5. **Audience**: older users — banners only by default, no sound, no full-screen ads mid-flow, frequency-cap any interstitial to one per finished game.
6. **Store listings**: declare ads in Play Console / App Store privacy forms.
7. Possible later: a paid "remove ads" option (in-app purchase) — separate from the no-real-money-gaming rule.
