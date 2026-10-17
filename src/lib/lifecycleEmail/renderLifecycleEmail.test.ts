import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIFECYCLE_BRAND,
  lifecycleCampaignPreheader,
  lifecycleCampaignSubject,
  lifecycleCtaLabel,
  renderLifecycleEmailHtml,
  renderLifecycleEmailText,
  resolveLifecycleGreetingFirstName,
  resolveLifecycleRenderCta,
} from './renderLifecycleEmail';
import { buildLifecycleRenderedEmail } from './templates';

describe('renderLifecycleEmail (source envoi)', () => {
  it('miroir Edge _shared identique', () => {
    const src = readFileSync(resolve(__dirname, './renderLifecycleEmail.ts'), 'utf8');
    const edge = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/lifecycleTemplates.ts'),
      'utf8'
    );
    expect(edge).toBe(src);
  });

  describe('resolveLifecycleGreetingFirstName', () => {
    it('prénom valide seul', () => {
      expect(resolveLifecycleGreetingFirstName('Marina')).toBe('Marina');
    });

    it('nom complet → premier jeton', () => {
      expect(resolveLifecycleGreetingFirstName('Marina Solange')).toBe('Marina');
      expect(resolveLifecycleGreetingFirstName('Jean-Pierre Dupont')).toBe('Jean-Pierre');
    });

    it('valeur administrative / marque rejetée', () => {
      expect(resolveLifecycleGreetingFirstName('Admin YOUMBIA')).toBeNull();
      expect(resolveLifecycleGreetingFirstName('admin')).toBeNull();
      expect(resolveLifecycleGreetingFirstName('YOUMBIA')).toBeNull();
      expect(resolveLifecycleGreetingFirstName('Utilisateur YOUMBIA')).toBeNull();
    });

    it('nom absent ou non fiable', () => {
      expect(resolveLifecycleGreetingFirstName(null)).toBeNull();
      expect(resolveLifecycleGreetingFirstName('')).toBeNull();
      expect(resolveLifecycleGreetingFirstName('   ')).toBeNull();
      expect(resolveLifecycleGreetingFirstName('a@b.com')).toBeNull();
    });
  });

  it('salutations HTML/texte : prénom, admin, absent — trois campagnes', () => {
    const campaigns = [
      'welcome_h0',
      'first_listing_h24',
      'abandoned_draft_h24',
    ] as const;
    for (const campaignId of campaigns) {
      const base = {
        campaignId,
        cta: { href: 'https://www.youmbia.com/', label: 'CTA', enabled: true },
        unsubscribeUrl: 'https://example.test/unsub',
      };

      const withFirst = {
        ...base,
        fullName: 'Ada Lovelace',
      };
      expect(renderLifecycleEmailHtml(withFirst)).toContain('Bonjour Ada,');
      expect(renderLifecycleEmailText(withFirst)).toContain('Bonjour Ada,');
      expect(renderLifecycleEmailHtml(withFirst)).not.toContain('Bonjour Ada Lovelace,');

      const admin = { ...base, fullName: 'Admin YOUMBIA' };
      expect(renderLifecycleEmailHtml(admin)).toContain('Bonjour,');
      expect(renderLifecycleEmailHtml(admin)).not.toContain('Admin');
      expect(renderLifecycleEmailText(admin)).toMatch(/^Bonjour,/m);

      const missing = { ...base, fullName: null };
      expect(renderLifecycleEmailHtml(missing)).toContain('Bonjour,');
      expect(renderLifecycleEmailText(missing)).toMatch(/^Bonjour,/m);
    }
  });

  it('sujets / préheaders / CTA labels P0', () => {
    expect(lifecycleCampaignSubject('welcome_h0')).toBe('Bienvenue sur YOUMBIA !');
    expect(lifecycleCampaignPreheader('welcome_h0')).toContain('confiance');
    expect(lifecycleCtaLabel('first_listing_h24')).toBe('Publier gratuitement');
    expect(lifecycleCtaLabel('abandoned_draft_h24')).toBe('Reprendre mon brouillon');
  });

  it('draft CTA ne pointe jamais vers /annonce', () => {
    const cta = resolveLifecycleRenderCta('abandoned_draft_h24', { dryRun: false });
    expect(cta.href).toBe('https://www.youmbia.com/');
    expect(cta.href).not.toContain('/annonce/');
  });

  it('HTML final : logo, slogan, unsub, pas de scheme mobile', () => {
    const pack = buildLifecycleRenderedEmail({
      campaignId: 'welcome_h0',
      fullName: 'Tommy',
      unsubscribeUrl: 'https://example.test/unsub',
      dryRun: false,
    });
    expect(pack.html).toContain(LIFECYCLE_BRAND.logoUrl);
    expect(pack.html).toContain(LIFECYCLE_BRAND.slogan);
    expect(pack.html).toContain('Découvrir YOUMBIA');
    expect(pack.html).toContain('Se désinscrire');
    expect(pack.html).not.toContain('youmbiamobile://');
    expect(pack.preheader).toBe(lifecycleCampaignPreheader('welcome_h0'));
  });

  it('brouillon sans titre : phrase générique', () => {
    const html = renderLifecycleEmailHtml({
      campaignId: 'abandoned_draft_h24',
      fullName: 'Ada',
      listingTitle: null,
      cta: { href: 'https://www.youmbia.com/', label: 'Reprendre mon brouillon', enabled: true },
      unsubscribeUrl: 'https://example.test/unsub',
    });
    expect(html).toContain('annonce en brouillon');
    expect(html).not.toContain('« <strong>');
  });
});
