import React from 'react';

/**
 * Ad placements — PLANNED, not live. See docs/ADS.md.
 * Slots exist only on browsing screens (Home, Games, Results/Settle). There is deliberately no slot type for
 * create / lobby / play: the PRD forbids ads during a game.
 * Until EXPO_PUBLIC_ADS_ENABLED=1 and a provider is wired in, this renders nothing and reserves no space.
 */
export type AdPlacement = 'home_feed' | 'games_list' | 'results_footer';
export const adsEnabled = process.env.EXPO_PUBLIC_ADS_ENABLED === '1';

export function AdSlot(_: { placement: AdPlacement }) {
  if (!adsEnabled) return null;
  // Provider goes here: react-native-google-mobile-ads <BannerAd> on iOS/Android, an AdSense unit on web.
  return null;
}
