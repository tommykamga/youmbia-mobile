import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('ConversationMessageBubble — finitions visuelles', () => {
  it('limite la largeur des bulles à ~83 %', () => {
    const src = read('src/features/conversation/ConversationMessageBubble.tsx');
    expect(src).toMatch(/CONVERSATION_BUBBLE_MAX_WIDTH = '83%'/);
    expect(src).toMatch(/maxWidth: CONVERSATION_BUBBLE_MAX_WIDTH/);
  });

  it('utilise les tokens design system pour les bulles sortantes', () => {
    const src = read('src/features/conversation/ConversationMessageBubble.tsx');
    expect(src).toMatch(/backgroundColor: colors\.primaryDark/);
    expect(src).toMatch(/color: colors\.surface/);
    expect(src).toMatch(/bubbleTimeMe:[\s\S]*colors\.primaryLight/);
    expect(src).not.toMatch(/#FFFFFF/);
    expect(src).not.toMatch(/rgba\(255,255,255/);
  });
});

describe('ConversationListingBanner — libellé allégé', () => {
  it('affiche un kicker court tout en conservant le libellé d’accessibilité annonce', () => {
    const src = read('src/features/conversation/ConversationListingBanner.tsx');
    expect(src).toMatch(/>\s*Annonce\s*<\//);
    expect(src).not.toMatch(/Annonce concernée/);
    expect(src).toMatch(/accessibilityLabel=\{`Annonce : \$\{title\}/);
  });
});

describe('MessagesDemoScreen — tab bar masquée en fil démo', () => {
  it('appelle le hook démo sans toucher aux routes conversation', () => {
    const demo = read('src/features/messages/demo/MessagesDemoScreen.tsx');
    const hook = read('src/features/messages/demo/useDemoThreadTabBarHidden.ts');
    expect(demo).toMatch(/useDemoThreadTabBarHidden\(preview != null\)/);
    expect(hook).toMatch(/tabBarStyle: \{ display: 'none' \}/);
    expect(hook).toMatch(/if \(!__DEV__ \|\| !hidden\) return/);
    expect(demo).not.toMatch(/router\.push\(`\/conversation\//);
  });
});

describe('ConversationComposer — zone de saisie', () => {
  it('aligne le padding horizontal sur screenHorizontal sans changer le contrat props', () => {
    const src = read('src/features/conversation/ConversationComposer.tsx');
    expect(src).toMatch(/paddingHorizontal: spacing\.screenHorizontal/);
    expect(src).toMatch(/onSend: \(\) => void/);
    expect(src).not.toMatch(/sendMessage/);
  });
});
