/**
 * Templates HTML FR — DA YOUMBIA (vert #16A34A / navy #0F172A).
 * Aucune dépendance Auth. CTA optionnel (peut être désactivé en dry-run).
 */

import { campaignSubject, type LifecycleCampaignId } from './campaigns';
import type { LifecycleCta } from './cta';

const BRAND_GREEN = '#16A34A';
const BRAND_NAVY = '#0F172A';
const BG = '#F8FAFC';
const LOGO =
  'https://www.youmbia.com/brand/youmbia-logo-header.svg';

export type LifecycleTemplateInput = {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  cta: LifecycleCta;
  unsubscribeUrl: string;
  listingTitle?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function greeting(fullName?: string | null): string {
  const name = String(fullName ?? '').trim();
  if (name) return `Bonjour ${escapeHtml(name)},`;
  return 'Bonjour,';
}

function bodyCopy(campaignId: LifecycleCampaignId, listingTitle?: string | null): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Bienvenue sur YOUMBIA, le marché qui vous élève. Explorez les annonces près de chez vous ou publiez la vôtre en quelques minutes.';
    case 'first_listing_h24':
      return 'Vous n’avez pas encore publié d’annonce. En quelques minutes, mettez en avant un article, un service ou un bien et rejoignez la communauté.';
    case 'abandoned_draft_h24': {
      const title = String(listingTitle ?? '').trim();
      if (title && title !== 'Brouillon') {
        return `Votre brouillon « ${escapeHtml(title)} » est toujours en attente. Reprenez-le pour le publier quand vous êtes prêt.`;
      }
      return 'Votre brouillon d’annonce est toujours en attente. Reprenez-le pour le publier quand vous êtes prêt.';
    }
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

export function renderLifecycleEmailHtml(input: LifecycleTemplateInput): string {
  const subject = campaignSubject(input.campaignId);
  const ctaBlock =
    input.cta.enabled && input.cta.href
      ? `<div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(input.cta.href)}"
           style="background:${BRAND_GREEN};color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:bold;font-size:16px;display:inline-block;">
          ${escapeHtml(input.cta.label)}
        </a>
      </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,sans-serif;color:${BRAND_NAVY};">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #E2E8F0;">
      <div style="text-align:center;margin-bottom:28px;">
        <img src="${LOGO}" alt="YOUMBIA" style="height:46px;max-width:180px;"/>
      </div>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${greeting(input.fullName)}</p>
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 18px;color:${BRAND_GREEN};">${escapeHtml(subject)}</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${bodyCopy(input.campaignId, input.listingTitle)}</p>
      ${ctaBlock}
      <div style="border-top:1px solid #E2E8F0;padding-top:18px;margin-top:24px;">
        <p style="margin:0;font-size:14px;line-height:1.5;color:#475569;">
          <strong style="color:${BRAND_NAVY};">L’équipe YOUMBIA</strong><br/>
          Le marché qui vous élève<br/>
          <a href="https://www.youmbia.com" style="color:${BRAND_GREEN};text-decoration:none;">www.youmbia.com</a>
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;line-height:1.5;color:#64748B;margin:16px 0 0;">
      Vous recevez cet e-mail car vous avez un compte YOUMBIA et avez accepté les communications marketing.
      <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#64748B;">Se désinscrire</a>
    </p>
  </div>
</body>
</html>`;
}

export function renderLifecycleEmailText(input: LifecycleTemplateInput): string {
  const subject = campaignSubject(input.campaignId);
  const lines = [
    greeting(input.fullName).replace(/&[^;]+;/g, ''),
    '',
    subject,
    '',
    bodyCopy(input.campaignId, input.listingTitle)
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
    '',
  ];
  if (input.cta.enabled && input.cta.href) {
    lines.push(`${input.cta.label} : ${input.cta.href}`, '');
  }
  lines.push(`Se désinscrire : ${input.unsubscribeUrl}`);
  return lines.join('\n');
}
