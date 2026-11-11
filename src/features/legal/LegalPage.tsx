// DRAFT — NOT LEGAL ADVICE. The privacy policy and terms shown by this screen (privacy.ts, terms.ts) were written
// from what the code does and MUST be reviewed by a lawyer before launch. See docs/RELEASE.md, section 12.
import React from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { C } from '@/theme/tokens';
import { BackBtn, Screen, T } from '@/ui';

/** A paragraph, or a short list of points. */
export type Block = string | { points: string[] };
export interface Section { title: string; body: Block[] }
export interface LegalDoc {
  eyebrow: string; title: string; updated: string; intro: string; sections: Section[];
  /** The other legal page, linked at the bottom. */
  other: { label: string; href: '/privacy' | '/terms' };
}

/**
 * PLACEHOLDER — this mailbox does not exist yet. Create it (or change the address here) before launch.
 * It is the address people are told to write to about privacy, account deletion and complaints.
 */
export const CONTACT_EMAIL = 'privacy@letsplaytambola.app';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
const P = ({ children }: { children: React.ReactNode }) => <T size={16} lh={1.5} color={C.soft}>{children}</T>;

/** Plain scrolling text page (privacy policy, terms). Readable signed-out. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <Screen fixedTop={48} gap={22} bottom={40}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackBtn onPress={back} />
        <T mono size={12} ls={0} color={C.muted}>{doc.eyebrow}</T>
      </View>
      <View style={{ gap: 6 }}>
        <T w={800} size={34} lh={1} accessibilityRole="header">{doc.title}</T>
        <T size={14} color={C.muted}>Last updated {doc.updated}</T>
      </View>
      <P>{doc.intro}</P>
      {doc.sections.map((s) => (
        <View key={s.title} style={{ gap: 8 }}>
          <T w={800} size={20} lh={1.2} accessibilityRole="header">{s.title}</T>
          {s.body.map((b, i) => (typeof b === 'string'
            ? <P key={i}>{b}</P>
            : (
              <View key={i} style={{ gap: 6 }}>
                {b.points.map((pt, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: 10 }}>
                    <T size={16} lh={1.5} color={C.mari}>•</T>
                    <View style={{ flex: 1, minWidth: 0 }}><P>{pt}</P></View>
                  </View>
                ))}
              </View>
            )))}
        </View>
      ))}
      <View style={{ gap: 8 }}>
        <T w={800} size={20} lh={1.2} accessibilityRole="header">Contact us</T>
        <P>
          Questions, requests or complaints about this page or your data:{' '}
          <T size={16} lh={1.5} w={600} color={C.mari} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}
            onPress={() => { void Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {}); }}>{CONTACT_EMAIL}</T>
        </P>
        <P>
          See also our{' '}
          <T size={16} lh={1.5} w={600} color={C.mari} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}
            onPress={() => router.replace(doc.other.href)}>{doc.other.label}</T>.
        </P>
      </View>
    </Screen>
  );
}
