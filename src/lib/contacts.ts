import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Contacts from 'expo-contacts/legacy';
import { backend } from '@/backend';
import { DEMO_CONTACTS } from '@/backend/local';
import { phoneDigits } from '@/backend/phone';
import type { DeviceContact } from '@/backend/types';

export type ContactsResult =
  | { status: 'ok'; contacts: DeviceContact[] }
  | { status: 'denied'; canAskAgain: boolean }     // the person said no to the system prompt
  | { status: 'unavailable' };                     // web: browsers have no address book

const OK_KEY = 'tambola:contactsOk';
/** Has this person already tapped "Allow contacts" on our explainer? */
export async function contactsAccepted(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(OK_KEY)) === '1'; } catch { return false; }
}
export async function acceptContacts(): Promise<void> {
  try { await AsyncStorage.setItem(OK_KEY, '1'); } catch { /* still works for this session */ }
}

/** "+91 98100 11001" for Indian mobiles; "+<digits>" otherwise. Input = digits with country code. */
export function formatPhone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return '+' + d;
}

/** One row per phone number owner: digits with country code (10-digit numbers → +91), de-duplicated, A→Z. */
export function normaliseContacts(raw: { id?: string; name?: string | null; numbers: (string | null | undefined)[] }[]): DeviceContact[] {
  const seen = new Set<string>();
  const out: DeviceContact[] = [];
  for (const c of raw) {
    const name = (c.name || '').trim();
    if (!name) continue;
    const phone = c.numbers.map((n) => phoneDigits(n || '')).find((d) => d.length >= 11 && d.length <= 15);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    out.push({ id: c.id || 'p' + phone, name, phone });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Read the address book. iOS/Android: asks the system permission, then loads names + numbers.
 * Web: the demo address book in demo mode, otherwise "unavailable" (share the link instead).
 */
export async function loadContacts(): Promise<ContactsResult> {
  if (Platform.OS === 'web') {
    return backend.mode === 'local' ? { status: 'ok', contacts: DEMO_CONTACTS } : { status: 'unavailable' };
  }
  try {
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') return { status: 'denied', canAskAgain: perm.canAskAgain !== false };
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], sort: Contacts.SortTypes.FirstName });
    return {
      status: 'ok',
      contacts: normaliseContacts(data.map((c) => ({
        id: c.id, name: c.name || [c.firstName, c.lastName].filter(Boolean).join(' '),
        numbers: (c.phoneNumbers ?? []).map((p) => p.number || p.digits),
      }))),
    };
  } catch {
    return { status: 'unavailable' };
  }
}
