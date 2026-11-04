import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Screen } from '@/components';
import { SwipeToDeleteRow } from '@/features/messages/SwipeToDeleteRow';
import { MessagesScreenHeader } from '@/features/messages/MessagesScreenHeader';
import { InboxConversationRow } from '@/features/messages/InboxConversationRow';
import { countUnreadConversations, INBOX_ROW_SEPARATOR_MARGIN_LEFT } from '@/features/messages/inboxDisplay';
import type { Conversation } from '@/services/conversations/types';
import { spacing, colors, typography, fontWeights } from '@/theme';
import {
  createMessagesDemoSnapshot,
  MESSAGE_DEMO_PREVIEW_BODY,
} from '@/features/messages/demo/messagesDemoFixtures';

type Props = { onExit: () => void };

type DemoListHeaderProps = {
  headerUnreadCount: number;
  devPanelOpen: boolean;
  onToggleDevPanel: () => void;
  onReset: () => void;
  onExit: () => void;
};

function MessagesDemoListHeader({
  headerUnreadCount,
  devPanelOpen,
  onToggleDevPanel,
  onReset,
  onExit,
}: DemoListHeaderProps) {
  return (
    <View>
      <MessagesScreenHeader unreadConversationsCount={headerUnreadCount} />
      <Text style={styles.banner} accessibilityRole="text">
        Démonstration locale — aucune conversation réelle
      </Text>
      <Pressable
        style={styles.demoIndicator}
        onPress={onToggleDevPanel}
        accessibilityRole="button"
        accessibilityLabel="Panneau de démonstration"
      >
        <Text style={styles.demoIndicatorText}>Démonstration</Text>
        <Text style={styles.demoIndicatorText}>{devPanelOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {devPanelOpen ? (
        <View style={styles.devPanel}>
          <Pressable
            style={styles.devBtn}
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Réinitialiser les 8 conversations"
          >
            <Text style={styles.devBtnText}>Réinitialiser les 8 conversations</Text>
          </Pressable>
          <Pressable style={styles.devBtn} onPress={onExit} accessibilityRole="button">
            <Text style={styles.devBtnText}>Quitter la démonstration</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function MessagesDemoScreen({ onExit }: Props) {
  const initial = useMemo(() => createMessagesDemoSnapshot(), []);
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    initial.conversations.map((c) => ({ ...c }))
  );
  const [thumbByListingId] = useState(initial.thumbByListingId);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [listEpoch, setListEpoch] = useState(0);
  const swipeGuardRef = React.useRef<string | null>(null);
  const [preview, setPreview] = useState<Conversation | null>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(false);

  const headerUnreadCount = countUnreadConversations(conversations);

  const resetLocal = useCallback(() => {
    const snap = createMessagesDemoSnapshot();
    setConversations(snap.conversations.map((c) => ({ ...c })));
    setOpenRowId(null);
    setPreview(null);
    swipeGuardRef.current = null;
    setListEpoch((epoch) => epoch + 1);
  }, []);

  const confirmHideLocal = useCallback((item: Conversation) => {
    Alert.alert(
      'Retirer de la liste de démonstration ?',
      'Action locale uniquement — aucune conversation réelle n’est modifiée.',
      [
        { text: 'Annuler', style: 'cancel', onPress: () => setOpenRowId(null) },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: () => {
            setConversations((prev) => prev.filter((c) => c.id !== item.id));
            setOpenRowId(null);
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <SwipeToDeleteRow
        key={`${listEpoch}-${item.id}`}
        rowId={item.id}
        openRowId={openRowId}
        onOpenRowIdChange={setOpenRowId}
        onDeletePress={() => confirmHideLocal(item)}
        onHorizontalGesture={() => {
          swipeGuardRef.current = item.id;
        }}
      >
        <InboxConversationRow
          item={item}
          listingThumbUrl={thumbByListingId[item.listing_id] ?? null}
          listingThumbPending={false}
          onPress={() => {
            if (openRowId === item.id) {
              setOpenRowId(null);
              return;
            }
            if (swipeGuardRef.current === item.id) {
              swipeGuardRef.current = null;
              return;
            }
            setPreview(item);
          }}
        />
      </SwipeToDeleteRow>
    ),
    [confirmHideLocal, openRowId, thumbByListingId, listEpoch]
  );

  const listHeader = (
    <MessagesDemoListHeader
      headerUnreadCount={headerUnreadCount}
      devPanelOpen={devPanelOpen}
      onToggleDevPanel={() => setDevPanelOpen((v) => !v)}
      onReset={resetLocal}
      onExit={onExit}
    />
  );

  return (
    <Screen noPadding safe={false}>
      <FlatList
        key={`messages-demo-list-${listEpoch}`}
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={listEpoch}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      <Modal visible={preview != null} animationType="slide" transparent onRequestClose={() => setPreview(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Conversation de démonstration</Text>
            {preview ? (
              <>
                <Text style={styles.modalListing}>
                  {preview.listing_title?.trim() || 'Annonce supprimée'}
                </Text>
                <Text style={styles.modalPeer}>{preview.other_party_name || 'Utilisateur'}</Text>
                <ScrollView style={styles.modalScroll}>
                  <Text style={styles.modalBody}>
                    {MESSAGE_DEMO_PREVIEW_BODY[preview.id] ??
                      'Aperçu local — aucun envoi ni lecture réelle.'}
                  </Text>
                </ScrollView>
              </>
            ) : null}
            <Pressable style={styles.devBtn} onPress={() => setPreview(null)} accessibilityRole="button">
              <Text style={styles.devBtnText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF3CD',
    color: '#614700',
    paddingHorizontal: spacing.screenHorizontal,
    paddingVertical: spacing.sm,
    fontSize: 12,
    fontWeight: fontWeights.semibold,
  },
  demoIndicator: {
    minHeight: 44,
    paddingHorizontal: spacing.screenHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8E2',
  },
  demoIndicatorText: { fontSize: 12, color: '#614700', fontWeight: fontWeights.semibold },
  devPanel: { padding: spacing.base, backgroundColor: '#FFF8E2', gap: spacing.sm },
  devBtn: {
    minHeight: 44,
    padding: spacing.md,
    backgroundColor: '#E9F5EF',
    borderRadius: 12,
    alignItems: 'center',
  },
  devBtnText: { ...typography.sm, fontWeight: fontWeights.semibold, color: colors.text },
  listContent: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: spacing['3xl'],
    flexGrow: 1,
    backgroundColor: colors.surface,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: INBOX_ROW_SEPARATOR_MARGIN_LEFT,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  modalTitle: { ...typography.lg, fontWeight: fontWeights.bold, color: colors.text },
  modalListing: { ...typography.base, fontWeight: fontWeights.semibold, marginTop: spacing.sm },
  modalPeer: { ...typography.sm, color: colors.textSecondary, marginTop: 4 },
  modalScroll: { maxHeight: 200, marginVertical: spacing.md },
  modalBody: { ...typography.sm, color: colors.text, lineHeight: 22 },
});
