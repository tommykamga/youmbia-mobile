/**
 * Rendu HTML/texte Lifecycle Email P0 — source unique (miroir Edge `_shared`).
 * Sans dépendance Node ; compatible Edge Runtime Deno.
 */

export type LifecycleRenderCampaignId =
  | 'welcome_h0'
  | 'first_listing_h24'
  | 'abandoned_draft_h24';

export const LIFECYCLE_BRAND = {
  green: '#16A34A',
  navy: '#0F172A',
  bg: '#F8FAFC',
  muted: '#64748B',
  border: '#E2E8F0',
  bodyMuted: '#475569',
  webOrigin: 'https://www.youmbia.com',
  /** SVG officiel (200 OK). Outlook : fallback alt text. */
  logoUrl: 'https://www.youmbia.com/brand/youmbia-logo-header.svg',
  slogan: 'Achetez. Vendez. En confiance.',
} as const;

export type LifecycleRenderCta = {
  href: string | null;
  label: string;
  enabled: boolean;
};

export type LifecycleRenderInput = {
  campaignId: LifecycleRenderCampaignId;
  fullName?: string | null;
  cta: LifecycleRenderCta;
  unsubscribeUrl: string;
  listingTitle?: string | null;
  webFallbackUrl?: string | null;
};

export function escapeLifecycleHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function lifecycleCampaignChannel(
  campaignId: LifecycleRenderCampaignId
): 'service' | 'marketing' {
  return campaignId === 'welcome_h0' ? 'service' : 'marketing';
}

export function lifecycleCampaignSubject(
  campaignId: LifecycleRenderCampaignId
): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Votre compte YOUMBIA est créé';
    case 'first_listing_h24':
      return 'Et si vous publiiez votre première annonce ?';
    case 'abandoned_draft_h24':
      return 'Votre brouillon d’annonce est toujours en attente';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

export function lifecycleCampaignPreheader(
  campaignId: LifecycleRenderCampaignId
): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Confirmation de création de votre compte YOUMBIA.';
    case 'first_listing_h24':
      return 'Sur YOUMBIA, publier votre annonce est gratuit.';
    case 'abandoned_draft_h24':
      return 'Votre brouillon est toujours enregistré dans votre compte.';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

export function lifecycleCtaLabel(campaignId: LifecycleRenderCampaignId): string {
  switch (campaignId) {
    case 'welcome_h0':
      return 'Ouvrir YOUMBIA';
    case 'first_listing_h24':
      return 'Publier gratuitement';
    case 'abandoned_draft_h24':
      return 'Reprendre mon brouillon';
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

/**
 * Routes CTA HTTPS réelles.
 * - welcome / first_listing → www.youmbia.com/ (seul chemin web vérifié pour découverte / publish)
 * - abandoned_draft → JAMAIS /annonce/{id} (page publique ≠ reprise brouillon app /sell?draftId=)
 *   → accueil web ; reprise éditeur = app mobile uniquement pour l’instant.
 */
export function resolveLifecycleRenderCta(
  campaignId: LifecycleRenderCampaignId,
  options?: { dryRun?: boolean }
): LifecycleRenderCta & { webFallbackUrl: string } {
  const home = `${LIFECYCLE_BRAND.webOrigin}/`;
  const label = lifecycleCtaLabel(campaignId);
  if (options?.dryRun === true && campaignId !== 'welcome_h0') {
    // Dry-run : bouton désactivé pour chemins non entièrement vérifiés hors welcome.
    return { href: null, label, enabled: false, webFallbackUrl: home };
  }
  return { href: home, label, enabled: true, webFallbackUrl: home };
}

/**
 * Jetons / libellés non utilisables comme prénom de salutation
 * (rôles, marque, placeholders — jamais affichés tels quels).
 */
const LIFECYCLE_UNRELIABLE_NAME_TOKENS = new Set([
  'admin',
  'administrator',
  'administrateur',
  'youmbia',
  'support',
  'test',
  'user',
  'utilisateur',
  'vendeur',
  'moderator',
  'moderateur',
  'root',
  'null',
  'undefined',
  'anonymous',
  'anonyme',
  'guest',
  'invite',
  'invité',
  'apple',
]);

function normalizeLifecycleNameToken(token: string): string {
  return token
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Prénom de salutation à partir de `profiles.full_name`.
 * - Prend le premier jeton fiable d’un nom complet (« Marina Solange » → « Marina »).
 * - Rejette les valeurs admin / marque / génériques (« Admin YOUMBIA » → null).
 * - Aucun prénom codé en dur.
 */
export function resolveLifecycleGreetingFirstName(
  fullName?: string | null
): string | null {
  const raw = String(fullName ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) return null;
  if (raw.includes('@')) return null;

  const tokens = raw.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    const normalized = normalizeLifecycleNameToken(token);
    if (!normalized) continue;
    if (LIFECYCLE_UNRELIABLE_NAME_TOKENS.has(normalized)) return null;
  }

  const first = tokens[0];
  if (!/^[\p{L}][\p{L}'’\-]*$/u.test(first)) return null;
  if (first.length < 2 || first.length > 40) return null;

  return first;
}

function greeting(fullName?: string | null): string {
  const name = resolveLifecycleGreetingFirstName(fullName);
  if (name) return `Bonjour ${escapeLifecycleHtml(name)},`;
  return 'Bonjour,';
}

function bodyParagraphsHtml(
  campaignId: LifecycleRenderCampaignId,
  listingTitle?: string | null
): string {
  switch (campaignId) {
    case 'welcome_h0':
      return `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Votre compte <strong>YOUMBIA</strong> a bien été créé.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Vous pouvez vous connecter à l’application pour gérer votre profil, consulter les annonces et publier lorsque vous le souhaitez.</p>`;
    case 'first_listing_h24':
      return `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Vous avez rejoint YOUMBIA, mais vous n’avez pas encore publié votre première annonce.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 14px;">Téléphone, vêtements, véhicule, service ou autre bien : donnez de la visibilité à ce que vous souhaitez vendre.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Ajoutez vos photos, fixez votre prix et publiez votre annonce gratuitement.</p>`;
    case 'abandoned_draft_h24': {
      const title = String(listingTitle ?? '').trim();
      const lead =
        title && title !== 'Brouillon'
          ? `Votre brouillon « <strong>${escapeLifecycleHtml(title)}</strong> » est toujours enregistré dans votre compte YOUMBIA et n’a pas encore été publié.`
          : 'Votre brouillon d’annonce est toujours enregistré dans votre compte YOUMBIA et n’a pas encore été publié.';
      return `<p style="font-size:16px;line-height:1.6;margin:0 0 14px;">${lead}</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Ouvrez l’application YOUMBIA pour le reprendre ou le supprimer.</p>`;
    }
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

function bodyParagraphsText(
  campaignId: LifecycleRenderCampaignId,
  listingTitle?: string | null
): string {
  switch (campaignId) {
    case 'welcome_h0':
      return [
        'Votre compte YOUMBIA a bien été créé.',
        '',
        'Vous pouvez vous connecter à l’application pour gérer votre profil, consulter les annonces et publier lorsque vous le souhaitez.',
      ].join('\n');
    case 'first_listing_h24':
      return [
        'Vous avez rejoint YOUMBIA, mais vous n’avez pas encore publié votre première annonce.',
        '',
        'Téléphone, vêtements, véhicule, service ou autre bien : donnez de la visibilité à ce que vous souhaitez vendre.',
        '',
        'Ajoutez vos photos, fixez votre prix et publiez votre annonce gratuitement.',
      ].join('\n');
    case 'abandoned_draft_h24': {
      const title = String(listingTitle ?? '').trim();
      const lead =
        title && title !== 'Brouillon'
          ? `Votre brouillon « ${title} » est toujours enregistré dans votre compte YOUMBIA et n’a pas encore été publié.`
          : 'Votre brouillon d’annonce est toujours enregistré dans votre compte YOUMBIA et n’a pas encore été publié.';
      return [
        lead,
        '',
        'Ouvrez l’application YOUMBIA pour le reprendre ou le supprimer.',
      ].join('\n');
    }
    default: {
      const _exhaustive: never = campaignId;
      return _exhaustive;
    }
  }
}

export function renderLifecycleEmailHtml(input: LifecycleRenderInput): string {
  const { green, navy, bg, muted, border, bodyMuted, logoUrl, slogan, webOrigin } =
    LIFECYCLE_BRAND;
  const subject = lifecycleCampaignSubject(input.campaignId);
  const preheader = lifecycleCampaignPreheader(input.campaignId);
  const channel = lifecycleCampaignChannel(input.campaignId);
  const fallback = input.webFallbackUrl?.trim() || `${webOrigin}/`;
  const channelLabel =
    channel === 'service' ? 'E-mail de service' : 'Communication marketing';
  const footerHtml =
    channel === 'service'
      ? `<p style="text-align:center;font-size:12px;line-height:1.5;color:${muted};margin:16px 8px 0;max-width:640px;">
          Cet e-mail confirme la <strong>création de votre compte</strong> YOUMBIA
          (e-mail de service, pas un e-mail de connexion ni marketing).
        </p>`
      : `<p style="text-align:center;font-size:12px;line-height:1.5;color:${muted};margin:16px 8px 0;max-width:640px;">
          Cet e-mail est une communication <strong>marketing</strong> YOUMBIA (pas un e-mail de connexion ni de sécurité).
          Vous le recevez car vous avez accepté les communications marketing.
          <a href="${escapeLifecycleHtml(input.unsubscribeUrl)}" style="color:${muted};">Se désinscrire</a>
        </p>`;

  const ctaBlock =
    input.cta.enabled && input.cta.href
      ? `<div style="text-align:center;margin:28px 0;">
        <a href="${escapeLifecycleHtml(input.cta.href)}"
           style="background:${green};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold;font-size:16px;display:inline-block;">
          ${escapeLifecycleHtml(input.cta.label)}
        </a>
      </div>
      <p style="text-align:center;font-size:13px;color:${muted};margin:0 0 8px;">
        Ou ouvrez <a href="${escapeLifecycleHtml(fallback)}" style="color:${green};">${escapeLifecycleHtml(fallback)}</a>
      </p>`
      : `<p style="text-align:center;font-size:15px;line-height:1.6;margin:24px 0;">
        Ouvrez YOUMBIA : <a href="${escapeLifecycleHtml(fallback)}" style="color:${green};font-weight:bold;">${escapeLifecycleHtml(fallback)}</a>
      </p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${escapeLifecycleHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${bg};font-family:Arial,Helvetica,sans-serif;color:${navy};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeLifecycleHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${bg};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:18px;border:1px solid ${border};">
          <tr>
            <td style="padding:32px 28px;">
              <div style="text-align:center;margin-bottom:16px;">
                <img src="${logoUrl}" alt="YOUMBIA" width="180" height="46" style="height:46px;max-width:180px;border:0;display:inline-block;"/>
              </div>
              <p style="text-align:center;font-size:13px;letter-spacing:0.04em;color:${muted};margin:0 0 8px;">${escapeLifecycleHtml(slogan)}</p>
              <p style="text-align:center;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${muted};margin:0 0 20px;">${channelLabel}</p>
              <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${greeting(input.fullName)}</p>
              ${bodyParagraphsHtml(input.campaignId, input.listingTitle)}
              ${ctaBlock}
              <div style="border-top:1px solid ${border};padding-top:18px;margin-top:24px;">
                <p style="margin:0;font-size:14px;line-height:1.5;color:${bodyMuted};">
                  <strong style="color:${navy};">L’équipe YOUMBIA</strong><br/>
                  ${escapeLifecycleHtml(slogan)}<br/>
                  <a href="${webOrigin}" style="color:${green};text-decoration:none;">www.youmbia.com</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
        ${footerHtml}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderLifecycleEmailText(input: LifecycleRenderInput): string {
  const subject = lifecycleCampaignSubject(input.campaignId);
  const channel = lifecycleCampaignChannel(input.campaignId);
  const fallback = input.webFallbackUrl?.trim() || `${LIFECYCLE_BRAND.webOrigin}/`;
  const greet = greeting(input.fullName);
  const lines = [
    greet,
    '',
    bodyParagraphsText(input.campaignId, input.listingTitle),
    '',
    `— ${LIFECYCLE_BRAND.slogan} —`,
    channel === 'service'
      ? 'E-mail de service YOUMBIA (création de compte — pas marketing ni connexion)'
      : 'Communication marketing YOUMBIA (pas un e-mail de connexion)',
    '',
  ];
  if (input.cta.enabled && input.cta.href) {
    lines.push(`${input.cta.label} : ${input.cta.href}`, '');
  }
  lines.push(`Ouvrir YOUMBIA : ${fallback}`, '');
  if (channel === 'marketing') {
    lines.push(`Se désinscrire : ${input.unsubscribeUrl}`);
  }
  void subject;
  return lines.join('\n');
}
