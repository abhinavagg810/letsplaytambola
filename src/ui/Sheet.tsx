import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, CONTENT_MAX, MOTION, R } from '@/theme/tokens';
import { ToastHost } from './Toast';
import { useKeyboardOverlap } from './useKeyboard';

/** Bottom sheet: slides up 0.3s cubic-bezier(.2,.9,.3,1); tap the scrim to close. `height` is a 0–1 fraction of the screen. */
export function Sheet({ open, onClose, children, height, light }: { open: boolean; onClose: () => void; children: React.ReactNode; height?: number; light?: boolean }) {
  const { height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(1)).current;
  const root = useRef<React.ComponentRef<typeof View>>(null);
  const kb = useKeyboardOverlap(root); // lift the sheet above the keyboard so inputs stay visible
  const room = H - kb - insets.top - 12;
  useEffect(() => {
    if (open) { y.setValue(1); Animated.timing(y, { toValue: 0, duration: MOTION.sheetMs, easing: Easing.bezier(0.2, 0.9, 0.3, 1), useNativeDriver: true }).start(); }
  }, [open, y]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View ref={root} style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,4,24,0.6)' }} />
        <Animated.View style={{
          position: 'absolute', left: 0, right: 0, bottom: kb, alignItems: 'center',
          transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, H] }) }],
        }}>
          <View style={{
            width: '100%', maxWidth: CONTENT_MAX + 40, height: height ? Math.min(H * height, room) : undefined, maxHeight: Math.min(H * 0.94, room),
            backgroundColor: light ? C.cream : C.surf, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet,
            paddingTop: 10, paddingBottom: kb ? 12 : Math.max(insets.bottom, 16), overflow: 'hidden',
          }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: light ? C.lightLine : C.line, marginBottom: 8 }} />
            {children}
          </View>
        </Animated.View>
        {/* A Modal covers the root toast host, so sheets carry their own. */}
        <ToastHost />
      </View>
    </Modal>
  );
}
