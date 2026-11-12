'use client';
import { useRef } from 'react';
import { DEFAULT_AUTO_SECONDS } from '@/core';
import type { MemberView } from '@/core';
import { cx, toast } from '@/components';
import type { UseGame } from '@/lib/useGame';
import styles from './Live.module.css';

/** Host only: "Call next number" and the Auto call on/off button (6 seconds, as in the design). */
export function HostControls({ game, act }: { game: MemberView; act: UseGame['act'] }) {
  const drawing = useRef(false);
  const toggling = useRef(false);
  const allCalled = game.called.length >= 90;
  const autoOn = game.auto > 0;

  const callNext = async () => {
    if (drawing.current || allCalled) return; // one number per tap, even on a double tap
    drawing.current = true;
    try {
      const r = await act({ type: 'draw' });
      if (!r.ok) toast(r.error);
    } finally {
      drawing.current = false;
    }
  };

  const toggleAuto = async () => {
    if (toggling.current) return;
    toggling.current = true;
    try {
      const r = await act({ type: 'setAuto', auto: autoOn ? 0 : DEFAULT_AUTO_SECONDS });
      if (!r.ok) toast(r.error);
    } finally {
      toggling.current = false;
    }
  };

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.callBtn} onClick={callNext} disabled={allCalled}>
        Call next number
      </button>
      <button type="button" className={cx(styles.autoBtn, autoOn && styles.autoOn)} aria-pressed={autoOn} onClick={toggleAuto}>
        {autoOn ? 'Auto on · Stop' : 'Auto call'}
      </button>
    </div>
  );
}
