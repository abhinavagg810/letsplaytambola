import React from 'react';
import { Pressable, View } from 'react-native';
import { C, R } from '@/theme/tokens';
import { Btn, Sheet, T } from '@/ui';
import { act } from './useOnline';

function Option({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}
      style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderRadius: R.btn, borderWidth: 1.5, borderColor: C.line, minHeight: 64, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <T w={800} size={17}>{title}</T>
      <T size={15} color={C.muted}>{sub}</T>
    </Pressable>
  );
}

/** Host only (README §4.14). Everyone stays in the game on the same link whichever option is picked. */
export function ResetSheet({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const run = async (action: { type: 'restart'; fresh: boolean } | { type: 'end' }) => {
    onClose();
    await act(code, action);
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 6, gap: 10 }}>
        <View style={{ marginBottom: 4 }}>
          <T w={800} size={24}>Reset the board?</T>
          <T size={15} color={C.muted}>Everyone stays in the game on the same link.</T>
        </View>
        <Option title="Restart — same tickets" sub="Clears numbers, dabs and claims" onPress={() => run({ type: 'restart', fresh: false })} />
        <Option title="Restart — fresh tickets" sub="Deals everyone a new ticket" onPress={() => run({ type: 'restart', fresh: true })} />
        <Btn label="End round & show winners" variant="teal" h={52} size={17} radius={R.btn} lip={false} onPress={() => run({ type: 'end' })} />
        <Btn label="Cancel" variant="ghost" h={44} size={15} w={500} onPress={onClose} />
      </View>
    </Sheet>
  );
}
