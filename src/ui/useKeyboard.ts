import React, { RefObject, useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';

/**
 * How many pixels of `ref`'s view the on-screen keyboard is covering (0 when hidden, and always 0 on web).
 * Measured against the view itself, so it stays correct whether or not the OS already resized the window
 * (Android does for normal screens but not inside a Modal; iOS never does).
 */
export function useKeyboardOverlap(ref: RefObject<React.ComponentRef<typeof View> | null>) {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const top = e.endCoordinates.screenY;
      const node = ref.current;
      if (!node) { setOverlap(e.endCoordinates.height); return; }
      node.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - top))));
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOverlap(0));
    return () => { show.remove(); hide.remove(); };
  }, [ref]);
  return overlap;
}
