import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from '@/lib/store';

/** Per-device preferences. `muted` = caller voice off. `autoDab` = dab called numbers for me (README §5, off by default). */
export const settings = createStore({ muted: false, autoDab: false });
const KEY = 'tambola:settings';
AsyncStorage.getItem(KEY).then((v) => { if (v) settings.set(JSON.parse(v)); }).catch(() => {});
export function setSetting(patch: Partial<{ muted: boolean; autoDab: boolean }>) {
  settings.set(patch);
  AsyncStorage.setItem(KEY, JSON.stringify(settings.get())).catch(() => {});
}
