#!/usr/bin/env node
/**
 * Envoi isolé des 3 HTML Lifecycle via API Resend (hors dispatch outbox).
 * Usage:
 *   RESEND_API_KEY=re_... RESEND_FROM='YOUMBIA <onboarding@resend.dev>' \
 *   PREVIEW_TO=you@example.com node scripts/send-lifecycle-template-previews.mjs
 * Kill switch / ALLOW_LIVE / cron : non concernés.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Load TS via tsx if available when run with node --import tsx
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const apiKey = process.env.RESEND_API_KEY || '';
  const to = process.env.PREVIEW_TO || '';
  const from = process.env.RESEND_FROM || '';
  if (!apiKey || !to || !from) {
    console.error('BLOCKED: set RESEND_API_KEY, RESEND_FROM, PREVIEW_TO (no secrets in repo).');
    process.exit(3);
  }
  if (apiKey.startsWith('re_') === false && !apiKey.startsWith('test_')) {
    console.error('BLOCKED: unexpected API key shape');
    process.exit(3);
  }
  // Dynamic import of rendered HTML files (already generated)
  const files = [
    ['01-welcome', 'Bienvenue sur YOUMBIA !'],
    ['02-first-listing', 'Et si vous publiiez votre première annonce ?'],
    ['03-abandoned-draft', 'Votre annonce est presque prête !'],
  ];
  const base = resolve(root, 'docs/previews/lifecycle-email');
  for (const [file, subject] of files) {
    const html = readFileSync(resolve(base, `${file}.html`), 'utf8');
    const text = readFileSync(resolve(base, `${file}.txt`), 'utf8');
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[PREVIEW] ${subject}`,
        html,
        text,
        tags: [
          { name: 'category', value: 'marketing' },
          { name: 'product', value: 'youmbia_lifecycle_preview' },
        ],
      }),
    });
    const body = await resp.text();
    console.log(file, resp.status, body.slice(0, 200));
    if (!resp.ok) process.exit(1);
  }
  console.log('PASS preview sends (isolated, not lifecycle outbox)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
