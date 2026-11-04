import React from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, StyleSheet, Keyboard } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardSafeView } from './KeyboardSafeView';
import { colors } from '@/theme';

export type CityPickerSheetProps = {
  visible: boolean;
  value: string;
  suggestions?: readonly string[];
  onChangeText: (value: string) => void;
  onApply: (value: string) => void;
  onReset: () => void;
  onClose: () => void;
};
/** Controlled shared presentation; applied criteria and data remain with each caller. */
export function CityPickerSheet({ visible, value, suggestions = [], onChangeText, onApply, onReset, onClose }: CityPickerSheetProps) {
  const close = () => { Keyboard.dismiss(); onClose(); };
  const apply = () => { Keyboard.dismiss(); onApply(value); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
    <KeyboardSafeView androidInsetPadding subtractSafeAreaBottom={false}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.sheet} onPress={event => event.stopPropagation()}>
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>Ville</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Fermer le choix de ville" onPress={close} style={styles.close}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <TextInput accessibilityLabel="Ville" value={value} onChangeText={onChangeText} placeholder="Ex. Douala"
              placeholderTextColor={colors.textMuted} autoCapitalize="words" returnKeyType="done" onSubmitEditing={apply} style={styles.input} />
            {suggestions.length > 0 && <View style={styles.suggestions}>{suggestions.slice(0, 6).map(city =>
              <Pressable key={city} accessibilityRole="button" accessibilityState={{ selected: value.trim().toLocaleLowerCase() === city.toLocaleLowerCase() }} onPress={() => onChangeText(city)} style={styles.suggestion}><Text>{city}</Text></Pressable>)}</View>}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={apply} style={styles.primary}><Text style={styles.primaryText}>Appliquer</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Réinitialiser la ville" onPress={() => { Keyboard.dismiss(); onReset(); }} style={styles.secondary}><Text style={styles.secondaryText}>Réinitialiser</Text></Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </KeyboardSafeView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '84%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  scroll: { flexGrow: 0, flexShrink: 1 }, content: { padding: 16, paddingBottom: 32, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.text },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, suggestion: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, primary: { flexGrow: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12, backgroundColor: '#0B4D3C', borderRadius: 12 },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 }, secondary: { flexGrow: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12, backgroundColor: colors.surfaceSubtle, borderRadius: 12 }, secondaryText: { color: colors.textSecondary, fontSize: 14 },
});
