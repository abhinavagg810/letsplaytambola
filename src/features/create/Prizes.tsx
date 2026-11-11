import React, { useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESETS, RULES, miniCells, ruleDesc } from '@core/data.ts';
import { potTotals } from '@core/autosplit.ts';
import { formatINR } from '@core/stats.ts';
import type { PrizeCfg } from '@core/types.ts';
import {
  activePresetKey, addPrize, applyPreset, draft, draftPot, effectivePrizes, libraryState, removePrize, resetAutoSplit,
  setPrizeAmt, stepPrizeAmt, togglePrize,
} from '@/state/draft';
import { C, F, R } from '@/theme/tokens';
import { BackBtn, Btn, Chip, Eyebrow, LinkBtn, tick, MiniTicket, Screen, T, Toggle, toast } from '@/ui';

/** Exact (fractional) line-height from the prototype, where rounding would drift row heights. */
const LH = (px: number) => ({ lineHeight: px });
const SYSTEM_FONT = { fontFamily: Platform.select({ web: 'Arial, sans-serif', default: undefined }) };
const GROUPS = RULES.map((r) => r.group).filter((g, i, a) => a.indexOf(g) === i);

/** Prizes (optional) — presets, pot meter, per-prize amounts, and the "More ways to win" library. README §4.11. */
export function Prizes() {
  const d = draft.use();
  const insets = useSafeAreaInsets();
  const [libOpen, setLibOpen] = useState(false);
  const price = Math.max(0, d.price || 0);
  const pot = draftPot(d);
  const eff = effectivePrizes(d);
  const { assigned, left, over, pct } = potTotals(eff, pot);
  const meterColor = over ? C.pink : left ? C.mari : C.teal;
  const presetKey = activePresetKey(d.prizeCfg);
  const done = () => (router.canGoBack() ? router.back() : router.replace('/new'));

  return (
    <Screen gap={14} px={18} top={Math.max(8, 48 - insets.top)} footer={<Btn label="Done" size={20} onPress={done} testID="prizes-done" />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackBtn onPress={done} />
        <Eyebrow ls={0} lh={1.25}>Prizes · Optional</Eyebrow>
      </View>
      <View style={{ gap: 4 }}>
        <T w={800} size={34} lh={1}>Prizes</T>
        <T size={15} color={C.muted} style={LH(20.25)}>We’ve picked the classics. Tweak them, add your own, or skip.</T>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PRESETS.map((ps) => {
          const active = ps.rules.slice().sort().join() === presetKey;
          return <Chip key={ps.name} label={ps.name} onPress={() => applyPreset(ps.rules)} bg={active ? C.mari : 'transparent'} fg={active ? C.ink : C.cream} border={active ? C.mari : C.line} size={14} w={600} px={14} minH={34} />;
        })}
      </View>

      {price > 0 && (
        <View style={{ gap: 10, padding: 14, borderRadius: R.cardLg, backgroundColor: C.surf }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Eyebrow size={11} ls={0.66} lh={1.2} numberOfLines={1}>Pot if all {d.seats} join</Eyebrow>
              <T w={800} size={38} lh={1.05}>{formatINR(pot)}</T>
            </View>
            <Pressable onPress={resetAutoSplit} hitSlop={6} accessibilityRole="button" accessibilityState={{ selected: !d.prizesTouched }}
              accessibilityLabel={d.prizesTouched ? 'Auto-split the pot' : 'Auto-split is on'} testID="auto-split"
              style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.teal, backgroundColor: d.prizesTouched ? 'transparent' : C.tealSoft18, alignItems: 'center', justifyContent: 'center' }}>
              <T w={800} size={14} color={C.teal} lh={1.6}>{tick(d.prizesTouched ? 'Auto-split' : 'Auto-split ✓')}</T>
            </Pressable>
          </View>
          <View style={{ height: 8, borderRadius: 99, backgroundColor: C.bg, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: meterColor }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T size={14} color={C.muted} lh={1.6}>{formatINR(assigned)} of {formatINR(pot)} assigned</T>
            <T w={800} size={14} color={meterColor} lh={1.6}>{tick(over ? `${formatINR(over)} over` : left ? `${formatINR(left)} left` : 'All set ✓')}</T>
          </View>
        </View>
      )}

      <View style={{ gap: 8 }}>
        {eff.map((p) => <PrizeCard key={p.id} p={p} showMoney={price > 0 && p.on} />)}
      </View>

      {!libOpen ? (
        <Btn label="+ More ways to win" variant="dashed" h={52} size={17} radius={R.card} onPress={() => setLibOpen(true)} testID="more-ways" />
      ) : (
        <View style={{ gap: 12, padding: 14, borderRadius: R.card, backgroundColor: C.surf, borderWidth: 1.5, borderColor: C.teal }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T w={800} size={19} lh={1.6}>More ways to win</T>
            <LinkBtn label="Done" size={16} onPress={() => setLibOpen(false)} />
          </View>
          <T size={14} color={C.muted} style={LH(18.9)}>Tap <T w={800} size={14} color={C.teal} style={LH(18.9)}>Add</T> on any one. Pink boxes on the little ticket show what you need.</T>
          {GROUPS.map((g) => (
            <View key={g} style={{ gap: 6 }}>
              <Eyebrow size={10} ls={0.8} lh={1.3} style={{ paddingTop: 4 }}>{g}</Eyebrow>
              {RULES.filter((r) => r.group === g).map((r) => {
                const { have, multi, nextName } = libraryState(d.prizeCfg, r.id);
                const added = have > 0 && !multi;
                const label = added ? 'Added ✓' : multi && have ? `+ ${nextName}` : 'Add';
                return (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: R.input, backgroundColor: C.bg }}>
                    <MiniTicket cells={miniCells(r.id)} width={58} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={800} size={16} style={LH(19.2)}>{r.name}</T>
                      <T size={13} color={C.soft} style={LH(15.6)}>{r.rule}</T>
                    </View>
                    <Pressable hitSlop={4} accessibilityRole="button" accessibilityLabel={added ? `${r.name} added` : `Add ${nextName}`}
                      onPress={() => {
                        const name = addPrize(r.id);
                        toast(name ? `Added ${name}` : `${r.name} is already in`);
                      }}
                      style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.teal, backgroundColor: added ? 'transparent' : C.teal, alignItems: 'center', justifyContent: 'center' }}>
                      <T w={800} size={14} color={added ? C.teal : C.ink} numberOfLines={1}>{tick(label)}</T>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

/** Rule under a prize name — the same line the library shows (prototype). */
const brief = (p: PrizeCfg) => ruleDesc(p.rule);

function PrizeCard({ p, showMoney }: { p: PrizeCfg; showMoney: boolean }) {
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: R.card, backgroundColor: p.on ? C.surf : 'transparent', borderWidth: 1.5, borderColor: p.custom ? C.teal : p.on ? C.surf : C.line, opacity: p.on ? 1 : 0.55 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <MiniTicket cells={miniCells(p.rule)} width={72} on={p.on ? C.pink : C.miniDim} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={800} size={17} style={LH(19.55)}>{p.label}</T>
          <T size={13} color={C.muted} style={LH(14.95)}>{brief(p)}{p.custom ? ' · your prize' : ''}</T>
        </View>
        {p.custom && (
          <Pressable onPress={() => removePrize(p.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${p.label}`}
            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.surf2, alignItems: 'center', justifyContent: 'center' }}>
            {/* The prototype draws this × in the system font, not Baloo. */}
            <T size={17} color={C.muted} lh={1} style={SYSTEM_FONT}>×</T>
          </Pressable>
        )}
        <Toggle small on={p.on} onChange={() => togglePrize(p.id)} label={p.label} />
      </View>
      {showMoney && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StepBtn label="−" a11y={`${p.label}: ₹10 less`} onPress={() => stepPrizeAmt(p.id, -10)} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: R.small, backgroundColor: C.bg, paddingHorizontal: 10 }}>
            <T w={800} size={18} color={C.mari}>₹</T>
            <AmountInput id={p.id} amt={Number(p.amt) || 0} label={p.label} />
          </View>
          <StepBtn label="+" a11y={`${p.label}: ₹10 more`} onPress={() => stepPrizeAmt(p.id, 10)} />
        </View>
      )}
    </View>
  );
}

function StepBtn({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={2}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: R.small, backgroundColor: C.surf2, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <T size={20} lh={1.1}>{label}</T>
    </Pressable>
  );
}

/** Editable amount. Keeps what is being typed locally so an empty box doesn't snap back to 0 mid-edit. */
function AmountInput({ id, amt, label }: { id: string; amt: number; label: string }) {
  const [text, setText] = useState(String(amt));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(amt)); }, [amt, focused]);
  return (
    <TextInput
      value={text} keyboardType="number-pad" inputMode="numeric" maxLength={6} selectTextOnFocus accessibilityLabel={`${label} amount in rupees`}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChangeText={(v) => { const clean = v.replace(/\D/g, ''); setText(clean); setPrizeAmt(id, Number(clean) || 0); }}
      style={{ width: 84, height: 40, fontSize: 20, fontFamily: F.bold, color: C.cream, paddingLeft: 4, paddingVertical: 0, outlineStyle: 'none' } as any}
    />
  );
}
