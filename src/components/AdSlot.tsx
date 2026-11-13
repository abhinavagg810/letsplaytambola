'use client';
import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, ADS_ON, AD_SLOTS, type AdPlacement } from '@/lib/ads';
import styles from './AdSlot.module.css';

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

/**
 * One responsive Google AdSense unit. Renders nothing unless ads are switched on AND this placement has an ad unit id,
 * so pages look exactly as designed until then. Labelled "Advertisement" so nobody mistakes it for part of the game.
 */
export function AdSlot({ placement, narrow, gapTop }: { placement: AdPlacement; /** match the 560px setup column */ narrow?: boolean; /** extra space above, to keep the ad away from a button */ gapTop?: boolean }) {
  const slot = AD_SLOTS[placement];
  const pushed = useRef(false);
  useEffect(() => {
    if (!ADS_ON || !slot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blocker or script not loaded: leave the space empty */
    }
  }, [slot]);
  if (!ADS_ON || !slot) return null;
  return (
    <aside className={`${styles.wrap}${narrow ? ' ' + styles.narrow : ''}${gapTop ? ' ' + styles.gapTop : ''}`} aria-label="Advertisement">
      <span className={styles.label}>Advertisement</span>
      <ins className={`adsbygoogle ${styles.unit}`} data-ad-client={ADSENSE_CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
