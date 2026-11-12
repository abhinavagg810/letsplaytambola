'use client';
// Ways to win (/host/prizes): presets + all 26 patterns as toggles. A sub-step of host setup.
import { useRouter } from 'next/navigation';
import { Button, Pill, toast } from '@/components';
import { PRESETS, RULES, RULE_GROUPS, matchPreset } from '@/core';
import { togglePrize, updateDraft, useHostDraft } from './draft';
import { markPrizesOpenedFromSetup, wasPrizesOpenedFromSetup } from './nav';
import styles from './host.module.css';

export function WaysToWin() {
  const router = useRouter();
  const draft = useHostDraft();
  const picked = new Set(draft.prizes);
  const preset = matchPreset(draft.prizes);

  function done() {
    if (!draft.prizes.length) {
      toast('Pick at least one way to win');
      return;
    }
    if (wasPrizesOpenedFromSetup()) {
      markPrizesOpenedFromSetup(false);
      router.back();
    } else {
      router.replace('/host');
    }
  }

  return (
    <div className={`${styles.page} ${styles.pagePrizes}`}>
      <div className={styles.top}>
        <button type="button" className={styles.back} onClick={done} aria-label="Back to game setup">
          <span aria-hidden="true">←</span>
        </button>
        <span className={styles.step}>Ways to win</span>
      </div>

      <div className={styles.head}>
        <h1 className={`${styles.h1} ${styles.h1Prizes}`}>How can people win?</h1>
        <p className={styles.sub}>Pick a ready-made set, or tap any pattern to add or remove it.</p>
      </div>

      <div className={styles.presets} role="group" aria-label="Ready-made sets">
        {PRESETS.map((p) => (
          <Pill key={p.name} size={46} selected={preset?.name === p.name} onClick={() => updateDraft({ prizes: [...p.rules] })}>
            {p.name}
          </Pill>
        ))}
      </div>

      {RULE_GROUPS.map((group) => (
        <section key={group} className={styles.group} aria-label={group}>
          <h2 className={styles.groupName}>{group}</h2>
          <div className={styles.groupCard}>
            {RULES.filter((r) => r.group === group).map((r) => {
              const on = picked.has(r.id);
              return (
                <button key={r.id} type="button" role="checkbox" aria-checked={on} className={styles.pattern} onClick={() => togglePrize(r.id)}>
                  <span className={styles.patternText}>
                    <span className={styles.patternName}>{r.name}</span>
                    <span className={styles.patternRule}>{r.rule}</span>
                  </span>
                  <span className={`${styles.check} ${on ? styles.checkOn : ''}`} aria-hidden="true">
                    {on ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className={styles.sticky}>
        <Button size={62} block onClick={done}>
          Done · {draft.prizes.length} picked
        </Button>
      </div>
    </div>
  );
}
