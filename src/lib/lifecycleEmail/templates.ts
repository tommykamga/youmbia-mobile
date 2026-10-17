/**
 * Templates HTML FR brandés YOUMBIA — catégorie marketing uniquement.
 * CTA = HTTPS web ; fallback texte si CTA désactivé (dry-run / chemin non vérifié).
 */

import { campaignSubject, type LifecycleCampaignId } from './campaigns';
import type { LifecycleCta } from './cta';
import {
  assertLifecycleIsMarketing,
  buildLifecycleProviderHeaders,
  buildLifecycleResendTags,
  LIFECYCLE_EMAIL_CATEGORY,
} from './emailCategory';
import { resolveLifecycleHttpsRoute } from './httpsRoutes';

const BRAND_GREEN = '#16A34A';
const BRAND_NAVY = '#0F172A';
const BG = '#F8FAFC';
const LOGO = 'https://www.youmbia.com/brand/youmbia-logo-header.svg';

export type LifecycleTemplateInput = {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  cta: LifecycleCta;
  unsubscribeUrl: string;
  listingTitle?: string | null;
  /** Affiché si CTA bouton désactivé — toujours HTTPS web. */
  webFallbackUrl?: string | null;
};

export type LifecycleRenderedEmail = {
  category: typeof LIFECYCLE_EMAIL_CATEGORY;
  campaignId: LifecycleCampaignId;
  subject: string;
  preheader: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
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

function preheaderFor(campaignId: LifecycleCampaignId): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Bienvenue sur YOUMBIA — explorez le marché près de chez vous.';
    case 'first_listing_h24':
      return 'Publiez votre première annonce en quelques minutes.';
    case 'abandoned_draft_h24':
      return 'Votre brouillon vous attend — finalisez et publiez.';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

function bodyCopy(campaignId: LifecycleCampaignId, listingTitle?: string | null): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Bienvenue sur <strong>YOUMBIA</strong>, le marché qui vous élève. Parcourez les annonces près de chez vous, contactez des vendeurs de confiance, ou publiez la vôtre en quelques minutes.';
    case 'first_listing_h24':
      return 'Vous n’avez pas encore publié d’annonce. En quelques minutes, mettez en avant un article, un service ou un bien et rejoignez la communauté YOUMBIA.';
    case 'abandoned_draft_h24': {
      const title = String(listingTitle ?? '').trim();
      if (title && title !== 'Brouillon') {
        return `Votre brouillon « <strong>${escapeHtml(title)}</strong> » est toujours en attente. Reprenez-le pour le publier quand vous êtes prêt.`;
      }
      return 'Votre brouillon d’annonce est toujours en attente. Reprenez-le pour le publier quand vous êtes prêt.';
    }
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function renderLifecycleEmailHtml(input: LifecycleTemplateInput): string {
  assertLifecycleIsMarketing(LIFECYCLE_EMAIL_CATEGORY);
  const subject = campaignSubject(input.campaignId);
  const preheader = preheaderFor(input.campaignId);
  const fallback = input.webFallbackUrl?.trim() || 'https://www.youmbia.com/';

  const ctaBlock =
    input.cta.enabled && input.cta.href
      ? `<div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(input.cta.href)}"
           style="background:${BRAND_GREEN};color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:bold;font-size:16px;display:inline-block;">
          ${escapeHtml(input.cta.label)}
        </a>
      </div>
      <p style="text-align:center;font-size:13px;color:#64748B;margin:0 0 8px;">
        Ou ouvrez <a href="${escapeHtml(fallback)}" style="color:${BRAND_GREEN};">${escapeHtml(fallback)}</a>
      </p>`
      : `<p style="text-align:center;font-size:15px;line-height:1.6;margin:24px 0;">
        Ouvrez YOUMBIA : <a href="${escapeHtml(fallback)}" style="color:${BRAND_GREEN};font-weight:bold;">${escapeHtml(fallback)}</a>
      </p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;color:${BRAND_NAVY};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border-radius:18px;padding:32px;border:1px solid #E2E8F0;">
      <div style="text-align:center;margin-bottom:20px;">
        <img src="${LOGO}" alt="YOUMBIA" style="height:46px;max-width:180px;"/>
      </div>
      <p style="text-align:center;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;margin:0 0 18px;">
        Communication marketing
      </p>
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
      Cet e-mail est une communication <strong>marketing</strong> (pas un e-mail de connexion ni de sécurité).
      Vous le recevez car vous avez accepté les communications marketing YOUMBIA.
      <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#64748B;">Se désinscrire</a>
    </p>
  </div>
</body>
</html>`;
}

export function renderLifecycleEmailText(input: LifecycleTemplateInput): string {
  assertLifecycleIsMarketing(LIFECYCLE_EMAIL_CATEGORY);
  const subject = campaignSubject(input.campaignId);
  const fallback = input.webFallbackUrl?.trim() || 'https://www.youmbia.com/';
  const lines = [
    stripTags(greeting(input.fullName)),
    '',
    subject,
    '',
    stripTags(bodyCopy(input.campaignId, input.listingTitle)),
    '',
    '— Communication marketing YOUMBIA (pas un e-mail de connexion) —',
    '',
  ];
  if (input.cta.enabled && input.cta.href) {
    lines.push(`${input.cta.label} : ${input.cta.href}`, '');
  }
  lines.push(`Ouvrir YOUMBIA : ${fallback}`, '');
  lines.push(`Se désinscrire : ${input.unsubscribeUrl}`);
  return lines.join('\n');
}

/** Package complet prêt pour le worker (mocks / Resend marketing). */
export function buildLifecycleRenderedEmail(args: {
  campaignId: LifecycleCampaignId;
  fullName?: string | null;
  unsubscribeUrl: string;
  listingTitle?: string | null;
  listingId?: string | null;
  dryRun?: boolean;
}): LifecycleRenderedEmail {
  const route = resolveLifecycleHttpsRoute(args.campaignId, {
    dryRun: args.dryRun,
    listingId: args.listingId,
  });
  const cta: LifecycleCta = {
    href: route.ctaEnabled ? route.httpsUrl : null,
    label:
      args.campaignId === 'welcome_h0'
        ? 'Découvrir YOUMBIA'
        : args.campaignId === 'first_listing_h24'
          ? 'Publier une annonce'
          : 'Ouvrir YOUMBIA',
    enabled: route.ctaEnabled,
    reasonDisabled: route.reasonDisabled,
  };
  const input: LifecycleTemplateInput = {
    campaignId: args.campaignId,
    fullName: args.fullName,
    cta,
    unsubscribeUrl: args.unsubscribeUrl,
    listingTitle: args.listingTitle,
    webFallbackUrl: route.webFallbackUrl,
  };
  return {
    category: LIFECYCLE_EMAIL_CATEGORY,
    campaignId: args.campaignId,
    subject: campaignSubject(args.campaignId),
    preheader: preheaderFor(args.campaignId),
    html: renderLifecycleEmailHtml(input),
    text: renderLifecycleEmailText(input),
    headers: buildLifecycleProviderHeaders(args.unsubscribeUrl),
    tags: buildLifecycleResendTags(args.campaignId),
  };
}
