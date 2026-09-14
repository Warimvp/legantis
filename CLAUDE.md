# Legantis — site vitrine de la société

Site statique (HTML + CSS, aucun build, aucun script exécutable) de **LEGANTIS DIGITAL SERVICE SAS**, éditeur d'Atlasya et de Rihla. Il sert aussi de preuve d'existence pour Apple (passage du compte Developer en « Organisation ») et pour Dun & Bradstreet : dénomination, adresse et numéros doivent rester **identiques au registre du commerce**.

En ligne sur **https://legantis.net** (GitHub Pages, déploiement à chaque push sur `main`). `warimvp.github.io/legantis/` redirige vers le domaine.

## Structure
- `site/index.html` (FR) · `site/en/index.html` (EN) · `site/mentions-legales/` (FR) · `site/en/legal/` (EN) · `site/404.html` (bilingue).
- `site/robots.txt`, `site/sitemap.xml` : URL absolues en `https://legantis.net/`.
- `site/assets/site.css` : feuille unique, jetons en tête (clair + sombre via `prefers-color-scheme`).
- Parti pris graphique (refonte du 14/09/2026) : les papiers d'une société marocaine, pris au sérieux et mis en beauté. Fond « chaux » (Casablanca, la ville blanche), encre de tampon indigo `#3D36B2` (entre le bleu d'Atlasya et le violet de Rihla), « Catalogue » (les produits, en couvertures aux couleurs de leurs icônes) et « Colophon » (l'identité légale, en formulaire à points de conduite). Une seule police de texte, **Archivo** variable (axe `wdth` 62–125 : étendue pour les titres, condensée pour le cachet), plus Spline Sans Mono pour les identifiants.
- **Le cachet** (`.cachet`) : signature du site, tampon de la société pressé sur la fiche d'identité de l'accueil (et « Retour à l'expéditeur » sur la 404). Il est `aria-hidden` (il répète la fiche) et **dans le flux, sous la liste** : ne jamais le repasser en `position: absolute`, il couvrirait l'adresse du siège sur mobile. Son grain vient du filtre SVG `#encre` déclaré en tête de chaque page qui l'utilise (accueils + 404) ; les pages légales n'en ont pas besoin. Son texte reprend RC, IF et ICE : à synchroniser avec le colophon.
- Polices servies par Google Fonts : c'est écrit dans le § « Données personnelles » des deux pages légales. Si on les auto-héberge, corriger ce paragraphe (FR + EN).
- Icônes produits : `assets/atlasya.png` (depuis `Medlink/apps/web-patient/public/apple-touch-icon.png`) et `assets/rihla.png` (depuis `rihla/public/icons/icon-192.png`), réduites à 112 px avec `sips -Z 112`. Les couleurs `--atlasya` et `--rihla` de `site.css` sont relevées sur ces icônes.
- `assets/favicon.svg`, `assets/apple-touch-icon.png` et `assets/partage.png` (image Open Graph 1200×630, avec le cachet) partagent les jetons de `site.css` ; les deux PNG sont générés par `outils/images.py` (`arch -x86_64 python3 outils/images.py` : Pillow est en x86_64 sur cette machine ; polices système Helvetica Neue et Avenir Next Condensed).
- Vérification visuelle : le panneau Navigateur masqué ne rend pas la page au défilement (captures vides). Utiliser le Playwright de RydeX (`require('/Users/user/Projects/RydeX/node_modules/playwright')`, `chromium` installé) pour des captures pleine page clair/sombre/mobile ; Chrome headless en ligne de commande impose une largeur minimale de fenêtre, donc ses captures « mobiles » débordent à tort.
- `404.html` est servie pour toute URL inconnue, quelle que soit sa profondeur : elle n'utilise que des chemins absolus (`/assets/…`).

## SEO et métadonnées
- Chaque page porte `canonical`, `hreflang` (fr, en, x-default) et Open Graph en URL absolues `https://legantis.net/…`.
- Les deux pages d'accueil portent un bloc JSON-LD `Organization` (données, pas du code) : dénomination, adresse, RC, ICE, email, téléphone. **Le garder synchronisé avec le colophon.**

## Identité légale (source : copie du RC du 08/09/2026)
- Dénomination exacte : `LEGANTIS DIGITAL SERVICE SAS` — au caractère près, c'est celle du D-U-N-S et d'Apple.
- RC Casablanca 745587 (07/09/2026) · ICE 004026900000030 · IF 73343482 · TP 34706792 · capital 10 000 MAD · Président : Yassir Legmara.
- Siège : Oasis Offices Latitudes, Route de l'Oasis, Bureau 304, Maarif, Casablanca. La mention « domiciliée chez MyLegal Offices » est exigée par l'article 4 du contrat de domiciliation.
- **Ne jamais publier** : CIN et date de naissance du Président, code d'accès SIMPL (il figure sur le bulletin IF).
- Toute modification de ces données se fait dans les **4 pages** (accueil + légal, FR + EN), dans les **2 blocs JSON-LD** et dans les pages légales d'Atlasya (`Medlink/apps/web-*/src/pages/MentionsLegalesPage.jsx`).

## Domaine et DNS
- `legantis.net` acheté chez Hostinger le 14/09/2026 (expire le 14/09/2027). Titulaire : la société (profil WHOIS 15857626, téléphone +212 672759097 depuis le 14/09/2026 ; l'API Hostinger ne modifie pas un profil : en recréer un et basculer les 4 rôles), protection WHOIS active, domaine verrouillé.
- DNS chez Hostinger : `@` A → 185.199.108-111.153 et AAAA → 2606:50c0:8000-8003::153 (GitHub Pages), `www` CNAME → `warimvp.github.io.`
- Le domaine personnalisé est réglé dans les paramètres Pages du dépôt (`gh api repos/Warimvp/legantis/pages`) : avec un déploiement par workflow, un fichier `site/CNAME` serait ignoré.

## En attente
- **Boîte `contact@legantis.net`** : affichée sur les 4 pages, à créer par le user dans hPanel (Hostinger Email). Jamais créée par Claude (mot de passe).
- **Téléphone chez D&B** : le site affiche le numéro marocain +212 6 72 75 90 97 depuis le 14/09/2026 (4 pages + 2 JSON-LD, ex-+33 7 66 37 28 99 provisoire). Faire corriger la fiche D&B (encore « 766372899 ») avec ce même numéro.
- **legantis.ma** (plus tard) : exige un contact administratif personne physique résidant au Maroc (coordonnées publiques, pas de masquage en .ma), un RC modèle 7 de moins de 3 mois déposé sous 14 jours, et 2 à 4 semaines de validation. Ensuite : `.net` redirige vers `.ma`, et toutes les URL absolues (canonical, hreflang, OG, JSON-LD, sitemap, robots) basculent.
- Hébergement : les pages légales annoncent GitHub Pages. Si l'hébergeur change, corriger le § « Hébergement » (FR + EN).

## Lancer
- Serveur `legantis-site` (port 5195) dans `~/.claude/launch.json` — ne jamais lancer via Bash.
