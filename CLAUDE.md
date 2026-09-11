# Legantis — site vitrine de la société

Site statique (HTML + CSS, aucun build, aucun script) de **LEGANTIS DIGITAL SERVICE SAS**, éditeur d'Atlasya et de Rihla. Il sert aussi de preuve d'existence pour Apple (passage du compte Developer en « Organisation ») et pour Dun & Bradstreet : dénomination, adresse et numéros doivent rester **identiques au registre du commerce**.

## Structure
- `site/index.html` (FR) · `site/en/index.html` (EN) · `site/mentions-legales/` (FR) · `site/en/legal/` (EN).
- `site/assets/site.css` : feuille unique, jetons en tête (clair + sombre via `prefers-color-scheme`).
- Parti pris graphique : un éditeur de logiciels présenté comme un éditeur tout court — « Catalogue » (les produits) et « Colophon » (l'identité légale). Newsreader (titres), Schibsted Grotesk (texte), Spline Sans Mono (identifiants).
- Polices servies par Google Fonts : c'est écrit dans le § « Données personnelles » des deux pages légales. Si on les auto-héberge, corriger ce paragraphe (FR + EN).
- Icônes produits : `assets/atlasya.png` (depuis `Medlink/apps/web-patient/public/apple-touch-icon.png`) et `assets/rihla.png` (depuis `rihla/public/icons/icon-192.png`), réduites à 112 px avec `sips -Z 112`.

## Identité légale (source : copie du RC du 08/09/2026)
- Dénomination exacte : `LEGANTIS DIGITAL SERVICE SAS` — au caractère près, c'est celle du D-U-N-S et d'Apple.
- RC Casablanca 745587 (07/09/2026) · ICE 004026900000030 · IF 73343482 · TP 34706792 · capital 10 000 MAD · Président : Yassir Legmara.
- Siège : Oasis Offices Latitudes, Route de l'Oasis, Bureau 304, Maarif, Casablanca. La mention « domiciliée chez MyLegal Offices » est exigée par l'article 4 du contrat de domiciliation.
- **Ne jamais publier** : CIN et date de naissance du Président, code d'accès SIMPL (il figure sur le bulletin IF).
- Toute modification de ces données se fait dans les **4 pages** (accueil + légal, FR + EN) et dans les pages légales d'Atlasya (`Medlink/apps/web-*/src/pages/MentionsLegalesPage.jsx`).

## En attente avant mise en ligne
- Domaine (legantis.ma recommandé) + boîte `contact@legantis.ma` : l'adresse est déjà écrite dans les 4 pages, elle doit exister avant publication.
- Hébergement : les pages légales annoncent GitHub Pages. Si l'hébergeur change, corriger le § « Hébergement » (FR + EN).
- Liens `hreflang` relatifs : les passer en URL absolues une fois le domaine connu.

## Lancer
- Serveur `legantis-site` (port 5195) dans `~/.claude/launch.json` — ne jamais lancer via Bash.
