import { useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TextProps } from 'react-native';
import { theme } from '../theme';

export function Label({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}

export function Button({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary,
      disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Label style={[styles.buttonText, secondary && styles.secondaryText, disabled && styles.disabledText]}>{label}</Label>
  </Pressable>;
}

// Only guidance is collapsed. Controls and live state never disappear with it.
export function Step({ number, title, help, children }: PropsWithChildren<{
  number: number; title: string; help: ReactNode;
}>) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title} details`}
      accessibilityHint="Show or hide guidance for this step"
      accessibilityState={{ expanded }} aria-expanded={expanded} onPress={() => setExpanded((value) => !value)}
      style={({ pressed }) => [styles.stepHeading, pressed && styles.pressed]}>
      <Label style={styles.stepNumber}>{String(number).padStart(2, '0')}</Label>
      <Label style={styles.stepTitle}>{title}</Label>
      <Label importantForAccessibility="no" aria-hidden style={styles.chevron}>{expanded ? '⌄' : '›'}</Label>
    </Pressable>
    {expanded && <View style={styles.help}>{help}</View>}
    <View style={styles.content}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  text: { fontFamily: theme.font, color: theme.text, fontSize: 15, lineHeight: 23 },
  button: { minHeight: 46, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1,
    borderColor: theme.accent, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center', borderRadius: 4 },
  buttonText: { color: theme.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  secondary: { backgroundColor: 'transparent', borderColor: theme.border, alignSelf: 'flex-start', maxWidth: '100%' },
  secondaryText: { color: theme.text },
  disabled: { backgroundColor: theme.disabled, borderColor: theme.border },
  disabledText: { color: theme.muted },
  pressed: { opacity: 0.72 },
  section: { borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 18 },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  stepNumber: { color: theme.muted, fontSize: 12, fontWeight: '500', width: 22 },
  stepTitle: { fontSize: 17, fontWeight: '600', flex: 1 },
  chevron: { color: theme.accent, fontSize: 25, width: 22, textAlign: 'center', lineHeight: 30 },
  content: { gap: 12, paddingTop: 10 },
  help: { marginTop: 6, marginBottom: 6, borderLeftWidth: 1, borderLeftColor: theme.border,
    paddingLeft: 12, paddingVertical: 4, gap: 8 },
});
