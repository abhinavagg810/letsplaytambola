import React from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { C } from '@/theme/tokens';
import { T } from './Text';
import { toast } from './Toast';

export async function copyText(text: string, msg: string) {
  try { await Clipboard.setStringAsync(text); toast(msg); } catch { toast('Copy failed'); }
}

/** "@priya [Copy]" — pill (Friends, Profile, sidebar) or inline (Home). */
export function HandleCopy({ handle, inline, h = 30 }: { handle: string | null | undefined; inline?: boolean; h?: number }) {
  if (!handle) return null;
  const onPress = () => copyText('@' + handle, 'Username copied');
  if (inline) {
    return (
      <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Copy username @${handle}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
        <T w={600} size={15} color={C.muted}>@{handle}</T>
        <T w={800} size={15} color={C.mari} style={{ textDecorationLine: 'underline' }}>Copy</T>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={(44 - h) / 2} accessibilityRole="button" accessibilityLabel={`Copy username @${handle}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: h, paddingLeft: 12, paddingRight: 4, borderRadius: 999, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.surf, alignSelf: 'flex-start' }}>
      <T w={800} size={15} color={C.mari}>@{handle}</T>
      <View style={{ height: h - 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.mari, alignItems: 'center', justifyContent: 'center' }}>
        <T w={800} size={15} color={C.ink}>Copy</T>
      </View>
    </Pressable>
  );
}
