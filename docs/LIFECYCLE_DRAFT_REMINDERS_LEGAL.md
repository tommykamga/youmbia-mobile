# Rappels de brouillon (`abandoned_draft_h24`) — qualification juridique & règles

**PR / branche :** `feat/lifecycle-draft-reminders-prep`  
**Statut activation service :** **NON ACTIVÉ**  
**Flag :** `app_runtime_flags.lifecycle_draft_reminders_as_service = false`

## 1. Constats d’information préalable (audit dépôt)

| Source | Mentions rappels brouillon | Suffisant pour base service ? |
|--------|----------------------------|-------------------------------|
| Signup (`app/(auth)/signup.tsx`) | Opt-in marketing générique (« annonces, rappels ») | **Non** — confondu avec marketing |
| Enregistrement brouillon (`app/sell`) | Absente avant cette PR | **Non** → **ajoutée** (notice + ack) |
| Paramètres (`app/account/settings.tsx`) | Marketing seul avant cette PR | Opposition draft **ajoutée** |
| Privacy in-app (`app/privacy.tsx`) | Redirige vers `https://youmbia.com/confidentialite` | **Hors dépôt** — à vérifier / mettre à jour côté web avant GO service |
| Email draft | Contenu factuel (reprise / suppression) | OK factuel ; canal encore **marketing** |

## 2. Killcritic — décision

**Thèse :** un rappel brouillon peut devenir un e-mail de **service relationnel** (exécution d’une action utilisateur : brouillon créé), distinct du marketing, **uniquement si** information préalable claire + base légale documentée + opposition effective.

| Critique | Classe | Traitement |
|----------|--------|------------|
| Activer sans opt-in marketing avant privacy web + ack prouvable | **BLOQUANT** | Flag service **OFF** ; enqueue reste `marketing_opt_in` |
| Rétro-masse sur 2 brouillons historiques prod | **BLOQUANT** | Cutoff `listings.created_at` conservé ; aucun envoi auto historique |
| Exclure comptes anciens pour **nouveaux** brouillons | **Écartée** | Pas de filtre `auth.users.created_at` sur draft |
| Confusion List-Unsubscribe / opposition draft | **Close (PR #19)** | Marketing global vs `scope=draft_reminders` |
| Modifier `first_listing_h24` | **Écartée** | Hors périmètre ; règles marketing préservées |

**Verdict activation service production aujourd’hui :** **NO-GO**.  
**Verdict préparation (cette PR) :** **GO** (info UI + opposition + docs + flag OFF).

## 3. Règles avant / après (cette PR)

| Règle | Avant | Après (préparation) |
|-------|-------|---------------------|
| Canal draft actif | marketing | **marketing** (inchangé) |
| `marketing_opt_in` | Requis | **Toujours requis** (service non câblé) |
| Opposition draft | Colonne + unsub email | + **Paramètres app** |
| Info préalable parcours brouillon | Absente | **Notice + ack horodaté** |
| Comptes historiques + **nouveau** brouillon | Éligibles si draft `created_at >= cutoff` + marketing | **Inchangé** (âge compte non filtrant) |
| Anciens brouillons pré-cutoff | Exclus | **Exclus** (pas de rétro masse) |
| Flag service | — | `false` ; lecture via `lifecycle_draft_reminders_as_service_enabled()` |
| `first_listing_h24` | marketing | **Inchangé** |

## 4. Conditions pour activer le canal service (checklist fermée)

1. Mise à jour de la politique de confidentialité web (`youmbia.com/confidentialite`) mentionnant les rappels facultatifs de brouillon, finalité, durée, opposition.
2. Preuve que les nouveaux enregistrements de brouillon exposent la notice et persistent `draft_reminders_notice_acknowledged_at`.
3. Validation juridique écrite (responsable / conseil) : base légale (intérêt légitime relationnel **ou** autre) pour envoi **sans** `marketing_opt_in`.
4. Migration dédiée câblant l’enqueue/revalidate service (ack + !opt_out + protections ; **sans** forcer les consentements historiques).
5. Rétro-application contrôlée des **anciens** brouillons : **interdit** en masse ; seulement scénario manuel/flag séparé après information ciblée.
6. QA SQL + Edge + kill switch inchangé + pas d’envoi pendant la préparation.
7. Autorisation explicite de déploiement.

## 5. Contenu email (cible factuelle — déjà en place)

- Brouillon enregistré, non publié.
- Possibilité de reprendre ou supprimer via l’app.
- Pas de formulation promotionnelle (« bonne affaire », « publiez gratuitement », etc.).
- Liens : désinscription marketing globale + opposition rappels brouillon.

## 6. Production (constat fourni)

Deux brouillons historiques, un vendeur, **aucun** brouillon actuellement éligible sous les contrôles de publication / cutoff — cohérent avec l’exclusion anti-rétro. Aucun envoi déclenché par cette PR.
