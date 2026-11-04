import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const demoGate = vi.hoisted(() => ({
  isMessagesDemoEnabled: vi.fn(() => false),
}));

vi.mock('@/features/messages/demo/messagesDemo', () => ({
  isMessagesDemoEnabled: demoGate.isMessagesDemoEnabled,
}));

vi.mock('@/features/messages/MessagesInboxScreen', () => ({
  MessagesInboxScreen: ({ onRequestDemo }: { onRequestDemo?: () => void }) =>
    React.createElement('MessagesInboxMock', { onRequestDemo }),
}));

vi.mock('@/features/messages/demo/MessagesDemoScreen', () => ({
  MessagesDemoScreen: ({ onExit }: { onExit: () => void }) =>
    React.createElement('MessagesDemoMock', { onExit }),
}));

import MessagesScreen from '../../../app/(tabs)/messages';
import { MessagesDemoScreen } from '@/features/messages/demo/MessagesDemoScreen';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MessagesScreen route — anti crash lazy undefined', () => {
  beforeEach(() => {
    demoGate.isMessagesDemoEnabled.mockReturnValue(false);
  });

  it("n'utilise plus React.lazy sur la route Messages", () => {
    const src = read('app/(tabs)/messages.tsx');
    expect(src).not.toMatch(/React\.lazy/);
    expect(src).not.toMatch(/import\s*\(\s*['"]@\/features\/messages\/demo\/MessagesDemoScreen/);
  });

  it('export nommé MessagesDemoScreen présent dans le module démo', () => {
    const src = read('src/features/messages/demo/MessagesDemoScreen.tsx');
    expect(src).toMatch(/export function MessagesDemoScreen/);
  });

  it("monte l'inbox réelle quand la démo est désactivée", () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MessagesScreen));
    });
    expect(tree.root.findByType('MessagesInboxMock' as never)).toBeTruthy();
    expect(() => tree.root.findByType('MessagesDemoMock' as never)).toThrow();
  });

  it('monte la démo sans composant lazy undefined', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    demoGate.isMessagesDemoEnabled.mockReturnValue(true);
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MessagesScreen));
    });
    expect(tree.root.findByType('MessagesDemoMock' as never)).toBeTruthy();
    expect(typeof MessagesDemoScreen).toBe('function');
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it('restaure inbox QA quand onExit est appelé (Quitter la démonstration)', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    demoGate.isMessagesDemoEnabled.mockReturnValue(true);
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MessagesScreen));
    });
    const demo = tree.root.findByType('MessagesDemoMock' as never);
    act(() => {
      demo.props.onExit();
    });
    expect(tree.root.findByType('MessagesInboxMock' as never)).toBeTruthy();
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it('production : pas de rendu démo sans __DEV__ même si le drapeau est actif', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    demoGate.isMessagesDemoEnabled.mockReturnValue(true);
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MessagesScreen));
    });
    expect(tree.root.findByType('MessagesInboxMock' as never)).toBeTruthy();
    expect(() => tree.root.findByType('MessagesDemoMock' as never)).toThrow();
  });
});
