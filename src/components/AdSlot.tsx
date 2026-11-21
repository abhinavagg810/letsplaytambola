'use client';
import { useEffect, useRef } from 'react';
import { ADSENSE_CLIENT, ADS_ON, AD_SLOTS, type AdPlacement } from '@/lib/ads';
import { track } from '@/lib/track';
import styles from './AdSlot.module.css';

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

/**
 * One responsive Google AdSense unit. Renders nothing unless ads are switched on AND this placement has an ad unit id,
 * so pages look exactly as designed until then. Labelled "Advertisement" so nobody mistakes it for part of the game.
 */
export function AdSlot({ placement, narrow, gapTop, seenAs }: {
  placement: AdPlacement;
  /** match the 560px setup column */ narrow?: boolean;
  /** extra space above, to keep the ad away from a button */ gapTop?: boolean;
  /** name used for the "Ad seen" count in the admin, e.g. lobby_player / lobby_host / results */
  seenAs?: 'lobby_player' | 'lobby_host' | 'results';
}) {
  const slot = AD_SLOTS[placement];
  const pushed = useRef(false);
  const box = useRef<HTMLElement>(null);
  // Count an ad view once it is at least half on screen for one second (once per page view of this slot).
  useEffect(() => {
    const el = box.current;
    if (!ADS_ON || !slot || !seenAs || !el || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        timer = setTimeout(() => { track('ad_seen', { slot: seenAs }); io.disconnect(); }, 1000);
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [slot, seenAs]);
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
    <aside ref={box} className={`${styles.wrap}${narrow ? ' ' + styles.narrow : ''}${gapTop ? ' ' + styles.gapTop : ''}`} aria-label="Advertisement">
      <span className={styles.label}>Advertisement</span>
      <ins className={`adsbygoogle ${styles.unit}`} data-ad-client={ADSENSE_CLIENT} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
