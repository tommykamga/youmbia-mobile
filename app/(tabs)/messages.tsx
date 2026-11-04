import React, { useState } from 'react';
import { isMessagesDemoEnabled } from '@/features/messages/demo/messagesDemo';
import { MessagesDemoScreen } from '@/features/messages/demo/MessagesDemoScreen';
import { MessagesInboxScreen } from '@/features/messages/MessagesInboxScreen';

export default function MessagesScreen() {
  const [demoActive, setDemoActive] = useState(() =>
    isMessagesDemoEnabled(__DEV__, process.env.EXPO_PUBLIC_MESSAGES_DEMO)
  );

  if (__DEV__ && demoActive) {
    return <MessagesDemoScreen onExit={() => setDemoActive(false)} />;
  }

  return (
    <MessagesInboxScreen
      onRequestDemo={__DEV__ ? () => setDemoActive(true) : undefined}
    />
  );
}
