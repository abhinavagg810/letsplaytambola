'use client';
import type { Ticket as TicketGrid } from '@/core';
import { Pill, Ticket, toast } from '@/components';
import type { UseGame } from '@/lib/useGame';

interface Props {
  name: string;
  ticket: TicketGrid;
  marks: readonly number[];
  act: UseGame['act'];
  onClaim: () => void;
}

/** Your ticket: tap a called number to dab it (or un-dab it); "Claim!" opens the claim sheet. */
export function MyTicket({ name, ticket, marks, act, onClaim }: Props) {
  const dab = async (n: number) => {
    // The dab shows at once (useGame is optimistic); a number that has not been called comes back as an error.
    const r = await act({ type: 'mark', n });
    if (!r.ok) toast(r.error);
  };
  return (
    <Ticket
      ticket={ticket}
      marked={marks}
      onCell={dab}
      title={`${name}’s ticket`}
      headerRight={
        <Pill variant="filled" size={46} style={{ flexShrink: 0 }} onClick={onClaim}>
          Claim!
        </Pill>
      }
      hint="Tap a number when it’s called. Tap Claim when you have a pattern."
    />
  );
}
