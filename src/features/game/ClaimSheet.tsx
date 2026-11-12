'use client';
import { ruleDesc } from '@/core';
import type { Prize } from '@/core';
import { Sheet, SheetOption, toast } from '@/components';
import type { UseGame } from '@/lib/useGame';

interface Props {
  open: boolean;
  onClose: () => void;
  prizes: readonly Prize[];
  act: UseGame['act'];
}

/** "What are you claiming?" — one button per open prize. The server checks the ticket; a miss is a gentle toast. */
export function ClaimSheet({ open, onClose, prizes, act }: Props) {
  const claim = async (prizeId: string) => {
    onClose();
    const r = await act({ type: 'claim', prizeId });
    // A good claim needs nothing here: the win reaches everyone (us included) as an event → banner and voice.
    if (!r.ok) toast(r.error);
  };
  return (
    <Sheet open={open} onClose={onClose} title="What are you claiming?" subtitle="We’ll check your ticket instantly.">
      {prizes
        .filter((p) => !p.winnerName)
        .map((p) => (
          <SheetOption key={p.id} label={p.label} detail={ruleDesc(p.rule)} onClick={() => claim(p.id)} />
        ))}
    </Sheet>
  );
}
