import React, { useEffect, useRef } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, CONTENT_MAX, MOTION, R } from '@/theme/tokens';
import { ToastHost } from './Toast';

/** Bottom sheet: slides up 0.3s cubic-bezier(.2,.9,.3,1); tap the scrim to close. `height` is a 0–1 fraction of the screen. */
export function Sheet({ open, onClose, children, height, light }: { open: boolean; onClose: () => void; children: React.ReactNode; height?: number; light?: boolean }) {
  const { height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (open) { y.setValue(1); Animated.timing(y, { toValue: 0, duration: MOTION.sheetMs, easing: Easing.bezier(0.2, 0.9, 0.3, 1), useNativeDriver: true }).start(); }
  }, [open, y]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,4,24,0.6)' }} />
        <Animated.View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center',
          transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, H] }) }],
        }}>
          <View style={{
            width: '100%', maxWidth: CONTENT_MAX + 40, height: height ? H * height : undefined, maxHeight: H * 0.94,
            backgroundColor: light ? C.cream : C.surf, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet,
            paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16), overflow: 'hidden',
          }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: light ? C.lightLine : C.line, marginBottom: 8 }} />
            {children}
          </View>
        </Animated.View>
        {/* A Modal covers the root toast host, so sheets carry their own. */}
        <ToastHost />
      </KeyboardAvoidingView>
    </Modal>
  );
}
