# EMAIL-UX-V2 — Stitch premium | Integration status

## Implemented in PR #36 (not deployed)
- Shared lifecycle HTML renderer in `supabase/functions/_shared/lifecycleTemplates.ts`, mirrored verbatim in `src/lib/lifecycleEmail/renderLifecycleEmail.ts`.
- Official YOUMBIA PNG logo, green branded header and App Store / Google Play badges.
- The production Edge v14 visible marketing unsubscribe button is incorporated into Git.
- Conditional cards for `weekly_discovery` (3 active images) and `listing_published_service` (owner-checked active listing), including real title, city, FCFA price, photo, direct listing link.
- Email worker fetches live listings and public images before render; incomplete/unsafe image metadata falls back to the existing text-based content. No sample photos/prices in production.
- Existing consent, signed unsubscribe, Resend transport, outbox, caps, flags and dispatch are unchanged.
- Welcome and first-listing messages inherit the premium header/footer; existing safe body copy and CTA destination are maintained.

## Deferred — not authorized by this PR
- New `nouveau_message_acheteur` trigger: there is no proven email-sending path for messages; requires a separate backend event/permission and anti-phantom / marketing vs service analysis.
- Real native Supabase Auth and Web auth email modifications: separate owners.
- Improvements that require an unverified mobile deep link, store destination, or new DB schema.

## QA/GO gate (required before production)
1. CI: lint, TS, tests (including renderer mirror and premium card / fallback).
2. Edge deployment bundle build / local or staging tests with masked fixtures.
3. Verify listing images `listing_images.url` are public HTTPS and domain allowlisted; if not, legacy fallback must work.
4. Test Web listing route `/annonce/{id}`, store badges, and unsubscribe URL.
5. Gmail, Outlook, Apple Mail at 320/375/600 and images disabled.
6. Test internal mailboxes only, explicitly confirm no duplicate or broadcast.
7. No merge, deployment, migration or bulk send without separate release GO.

## Killcritic
- This is a draft integration PR, not evidence of E2E QA or deployment readiness.
- On PR base, active Edge v14 contained an enhanced unsubscribe control missing from GitHub main; this PR imports that production behavior to prevent a regression.
