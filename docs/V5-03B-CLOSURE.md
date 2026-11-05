# V5-03B — Clôture locale

Référence : `0ec7194`. GO local uniquement, sans livraison.

Corrections démontrées : typage natif de `get_v5_discovery_listing_ids` dans
Database et suppression du cast RPC ; conservation de l'ordre global dans le feed
au lieu d'un second tri par date de création. Le contrôle s'appelle « Découvrir » ;
les comparateurs prix restent inchangés. Aucun changement de formule SQL.

Validation : 16 tests ciblés PASS, 0 FAIL (RPC/transport simulés, affichage et
contrats). TypeScript et diff --check PASS. PostgreSQL 17.6 réel sur QA existante
loopback 55432 : huit assertions PASS, rôles anon et authenticated, 10 vendeurs
synthétiques / 30 annonces actives et quatre statuts privés, ROLLBACK complet.
Contrôles : ordre de pages équivalent à la tranche globale, absence de doublon sur
jeu fixe, top 10 organique avec 10 vendeurs distincts, limites, épuisement et RLS.

Compatibilité 4.7.0 : RPC additive, SECURITY INVOKER, aucune ancienne signature ou
écriture changée. Nouveau client : fallback historique uniquement si RPC absente ;
permission refusée ne déclenche aucun fallback. Types Supabase vérifiés localement.

Réserves : pas de QA physique ni PostgREST HTTP ; pagination offset déterministe
sur jeu fixe, sans snapshot inter-pages si catalogue/renouvellements évoluent.
La priorité sponsorisée existante précède la diversification ; le test top 10 porte
sur l'organique. La migration reste non appliquée en Production.

Fichiers : src/types/database.ts, src/services/listings/getPublicListings.ts,
src/services/listings/getPublicListings.test.ts, src/features/listings/ListingFeed.tsx,
src/features/listings/discoveryDisplay.ts et .test.ts,
supabase/scripts/v5_03b_discovery_tests.sql, ce rapport.
